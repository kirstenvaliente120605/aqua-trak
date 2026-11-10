<?php
/**
 * ERD-backed commerce endpoints for the customer dashboard.
 *
 * The database follows the ERD: USER, STATION_OWNER, CUSTOMER, STATION, REWARD,
 * PROMOTION, NOTIFICATION, CUSTOMER_REWARD, PRODUCT, SUBSCRIPTION_PLAN, ORDER,
 * STAFF, PRICING, SUBSCRIPTION, ORDER_ITEM.
 *
 * Every write is transactional and uses prepared statements. Everything the UI
 * needs that has no ERD column (notes, landmark, timelines, ...) is stored in a
 * JSON `meta` column on ORDER / SUBSCRIPTION so the ERD stays authoritative
 * while the API remains lossless.
 */

declare(strict_types=1);

namespace AquaTracker;

final class ErdController
{
    // -- customer / station helpers -----------------------------------------

    /** The CUSTOMER row for the signed-in user, created on first use. */
    private static function customerFor(string $userId): array
    {
        $row = Database::one('SELECT * FROM customer WHERE user_id = ? LIMIT 1', [$userId]);
        if ($row !== null) {
            return $row;
        }

        $id = Database::uuid();
        Database::run(
            'INSERT INTO customer (id, user_id, default_address, aqua_points) VALUES (?, ?, ?, 0)',
            [$id, $userId, '']
        );

        return ['id' => $id, 'user_id' => $userId, 'default_address' => '', 'aqua_points' => 0];
    }

    private static function ensureStation(string $id, string $name, string $address = ''): string
    {
        if ($id === '') {
            Response::fail('A station is required.', 400);
        }

        $id = mb_substr($id, 0, 36);
        $exists = Database::scalar('SELECT id FROM station WHERE id = ? LIMIT 1', [$id]);
        if ($exists !== null) {
            return $id;
        }

        $byName = $name !== ''
            ? Database::scalar('SELECT id FROM station WHERE name = ? ORDER BY id ASC LIMIT 1', [mb_substr($name, 0, 190)])
            : null;
        if ($byName !== null) {
            return (string) $byName;
        }

        Response::fail('The selected station is no longer available. Refresh the station list and try again.', 404);
    }

    /** Resolve (or create) the product row for a station + container type. */
    private static function ensureProduct(string $stationId, string $type, string $label, float $unitPrice): string
    {
        $type = $type !== '' ? $type : 'refill';
        $id = mb_substr($stationId . ':' . $type, 0, 36);

        $exists = Database::scalar('SELECT id FROM product WHERE id = ? LIMIT 1', [$id]);
        if ($exists === null) {
            Database::run(
                'INSERT INTO product (id, station_id, name, unit, stock_qty, type) VALUES (?, ?, ?, ?, 0, ?)',
                [$id, $stationId, mb_substr($label !== '' ? $label : $type, 0, 190), 'refill', $type]
            );
        }

        $priced = Database::scalar('SELECT id FROM pricing WHERE product_id = ? LIMIT 1', [$id]);
        if ($priced === null) {
            Database::run(
                'INSERT INTO pricing (id, product_id, price) VALUES (?, ?, ?)',
                [Database::uuid(), $id, $unitPrice]
            );
        }

        return $id;
    }

    private static function stationName(string $stationId, string $fallback = ''): string
    {
        $name = Database::scalar('SELECT name FROM station WHERE id = ? LIMIT 1', [$stationId]);
        if ($name !== null && (string) $name !== '') {
            return (string) $name;
        }
        return $fallback !== '' ? $fallback : 'Water Refilling Station';
    }

    // -- stations ------------------------------------------------------------

    public static function stations(RouteContext $ctx): never
    {
        $rows = Database::all('SELECT * FROM station ORDER BY name ASC');
        $out = array_map(static fn (array $r): array => [
            'id'       => $r['id'],
            'name'     => (string) $r['name'],
            'address'  => (string) $r['address'],
            'coords'   => $r['lat'] === null || $r['lng'] === null ? null : ['lat' => (float) $r['lat'], 'lng' => (float) $r['lng']],
            'status'   => (string) $r['status'],
            'delivery' => true,
        ], $rows);

        Response::json(['stations' => $out]);
    }

    // -- orders --------------------------------------------------------------

    public static function createOrder(RouteContext $ctx): never
    {
        $user = $ctx->user;
        $customer = self::customerFor((string) $user['id']);

        $stationId = $ctx->str('stationId');
        if ($stationId === '') {
            Response::fail('Choose a station before placing an order.', 400);
        }

        $items = $ctx->input('items', $ctx->input('containers', []));
        if (!is_array($items) || $items === []) {
            Response::fail('Add at least one item to the order.', 400);
        }

        $stationName = $ctx->str('stationName');
        $stationId = self::ensureStation($stationId, $stationName, $ctx->str('stationAddress'));

        $fulfillment = $ctx->str('fulfillmentType', $ctx->str('fulfillment', 'delivery'));
        $fulfillment = $fulfillment === 'pickup' ? 'pickup' : 'delivery';
        $status = $fulfillment === 'pickup' ? 'new' : 'pending';

        $cleanItems = [];
        $computedTotal = 0.0;
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $qty = (int) ($item['count'] ?? $item['qty'] ?? 0);
            $unit = (float) ($item['unitPrice'] ?? $item['price'] ?? 0);
            if ($qty < 1 || $unit < 0) {
                Response::fail('Each order item needs a quantity of at least 1.', 400);
            }
            $type  = (string) ($item['type'] ?? 'refill');
            $label = (string) ($item['label'] ?? $item['name'] ?? $type);
            $productId = self::ensureProduct($stationId, $type, $label, $unit);
            $cleanItems[] = [
                'productId' => $productId,
                'type'      => $type,
                'label'     => $label,
                'qty'       => $qty,
                'unitPrice' => $unit,
            ];
            $computedTotal += $qty * $unit;
        }

        if ($cleanItems === []) {
            Response::fail('Add at least one item to the order.', 400);
        }

        $subtotal    = (float) $ctx->input('subtotal', $computedTotal);
        $discount    = (float) $ctx->input('discount', 0);
        $deliveryFee = (float) $ctx->input('deliveryFee', 0);
        $total       = (float) $ctx->input('total', max(0, $subtotal - $discount + $deliveryFee));
        $gallons     = (int) $ctx->input('gallonsTotal', array_sum(array_column($cleanItems, 'qty')));
        $points      = max(0, $gallons * 10);

        $meta = [
            'stationName'     => $stationName !== '' ? $stationName : self::stationName($stationId),
            'stationAddress'  => $ctx->str('stationAddress'),
            'customerName'    => (string) ($user['name'] ?? ''),
            'items'           => $cleanItems,
            'gallonsTotal'    => $gallons,
            'fulfillmentType' => $fulfillment,
            'deliveryAddress' => $ctx->str('deliveryAddress'),
            'landmark'        => $ctx->str('landmark'),
            'contactPhone'    => $ctx->str('contactPhone'),
            'notes'           => $ctx->str('notes'),
            'paymentMethod'   => $ctx->str('paymentMethod', 'cod'),
            'paymentStatus'   => $ctx->str('paymentMethod') === 'pay_at_counter' ? 'unpaid' : 'paid',
            'subtotal'        => $subtotal,
            'discount'        => $discount,
            'deliveryFee'     => $deliveryFee,
            'pointsEarned'    => $points,
        ];

        $orderId = Database::uuid();
        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            Database::run(
                'INSERT INTO `ORDER` (id, customer_id, station_id, promotion_id, type, status, total, created_at, meta)
                 VALUES (?, ?, ?, NULL, ?, ?, ?, NOW(), ?)',
                [
                    $orderId,
                    $customer['id'],
                    $stationId,
                    $fulfillment,
                    $status,
                    $total,
                    json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                ]
            );

            foreach ($cleanItems as $item) {
                Database::run(
                    'INSERT INTO order_item (id, order_id, product_id, qty, unit_price) VALUES (?, ?, ?, ?, ?)',
                    [Database::uuid(), $orderId, $item['productId'], $item['qty'], $item['unitPrice']]
                );
            }

            Database::run(
                'UPDATE customer SET aqua_points = aqua_points + ? WHERE id = ?',
                [$points, $customer['id']]
            );

            self::notify(
                (string) $user['id'],
                'Order placed',
                sprintf('Your %s order from %s was received. You earned +%d AquaPoints.', $fulfillment, $meta['stationName'], $points)
            );

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            Response::fail('Could not save the order: ' . $e->getMessage(), 500);
        }

        $order = self::loadOrder($orderId, $customer['id']);
        Response::json(['success' => true, 'order_id' => $orderId, 'order' => $order], 201);
    }

    public static function listOrders(RouteContext $ctx): never
    {
        $customer = self::customerFor((string) $ctx->user['id']);
        $rows = Database::all(
            'SELECT id FROM `ORDER` WHERE customer_id = ? ORDER BY created_at DESC, id DESC',
            [$customer['id']]
        );

        $orders = [];
        foreach ($rows as $row) {
            $order = self::loadOrder((string) $row['id'], (string) $customer['id']);
            if ($order !== null) {
                $orders[] = $order;
            }
        }

        Response::json(['orders' => $orders]);
    }

    public static function updateOrderStatus(RouteContext $ctx): never
    {
        $customer = self::customerFor((string) $ctx->user['id']);
        $orderId = $ctx->param('id');
        $status = $ctx->str('status');

        $allowed = ['pending', 'confirmed', 'out-for-delivery', 'completed', 'cancelled', 'new', 'preparing', 'ready_for_pickup'];
        if (!in_array($status, $allowed, true)) {
            Response::fail('Unsupported order status.', 400);
        }

        $order = Database::one(
            'SELECT * FROM `ORDER` WHERE id = ? AND customer_id = ? LIMIT 1',
            [$orderId, $customer['id']]
        );
        if ($order === null) {
            Response::fail('Order not found.', 404);
        }

        Database::run('UPDATE `ORDER` SET status = ? WHERE id = ?', [$status, $orderId]);
        Response::json(['success' => true, 'order' => self::loadOrder($orderId, (string) $customer['id'])]);
    }

    /** @return array<string,mixed>|null */
    private static function loadOrder(string $orderId, string $customerId): ?array
    {
        $row = Database::one(
            'SELECT * FROM `ORDER` WHERE id = ? AND customer_id = ? LIMIT 1',
            [$orderId, $customerId]
        );
        if ($row === null) {
            return null;
        }

        $meta = json_decode((string) ($row['meta'] ?? '{}'), true);
        if (!is_array($meta)) {
            $meta = [];
        }

        $items = Database::all(
            'SELECT oi.product_id, oi.qty, oi.unit_price, p.name, p.type
             FROM order_item oi
             LEFT JOIN product p ON p.id = oi.product_id
             WHERE oi.order_id = ?',
            [$orderId]
        );

        $shapedItems = array_map(static fn (array $i): array => [
            'productId' => $i['product_id'],
            'type'      => (string) ($i['type'] ?? 'refill'),
            'label'     => (string) ($i['name'] ?? 'Refill'),
            'count'     => (int) $i['qty'],
            'unitPrice' => (float) $i['unit_price'],
        ], $items);

        if ($shapedItems === [] && isset($meta['items']) && is_array($meta['items'])) {
            $shapedItems = $meta['items'];
        }

        $status = (string) $row['status'];
        $fulfillment = (string) $row['type'];

        return [
            'id'             => $row['id'],
            'customerId'     => $row['customer_id'],
            'stationId'      => $row['station_id'],
            'stationName'    => $meta['stationName'] ?? self::stationName((string) $row['station_id']),
            'stationAddress' => $meta['stationAddress'] ?? '',
            'customerName'   => $meta['customerName'] ?? '',
            'items'          => $shapedItems,
            'containers'     => $shapedItems,
            'gallonsTotal'   => (int) ($meta['gallonsTotal'] ?? array_sum(array_column($shapedItems, 'count'))),
            'fulfillment'    => $fulfillment,
            'fulfillmentType' => $fulfillment,
            'deliveryAddress' => $meta['deliveryAddress'] ?? '',
            'landmark'       => $meta['landmark'] ?? '',
            'contactPhone'   => $meta['contactPhone'] ?? '',
            'notes'          => $meta['notes'] ?? '',
            'paymentMethod'  => $meta['paymentMethod'] ?? 'cod',
            'paymentStatus'  => $meta['paymentStatus'] ?? 'paid',
            'subtotal'       => (float) ($meta['subtotal'] ?? $row['total']),
            'discount'       => (float) ($meta['discount'] ?? 0),
            'deliveryFee'    => (float) ($meta['deliveryFee'] ?? 0),
            'total'          => (float) $row['total'],
            'pointsEarned'   => (int) ($meta['pointsEarned'] ?? 0),
            'status'         => $status,
            'timeline'       => self::timeline($fulfillment, $status),
            'createdAt'      => Dates::iso($row['created_at']),
        ];
    }

    /** @return list<array<string,mixed>> */
    private static function timeline(string $fulfillment, string $status): array
    {
        $stages = $fulfillment === 'pickup'
            ? [['new', 'Order Received at Station'], ['preparing', 'Station Preparing Refill'], ['ready_for_pickup', 'Ready for Counter Pickup'], ['completed', 'Picked Up & Paid']]
            : [['pending', 'Order Received at Station'], ['confirmed', 'Station Preparing Refill'], ['out-for-delivery', 'Out for Delivery'], ['completed', 'Completed']];

        $current = array_search($status, array_column($stages, 0), true);
        if ($current === false) {
            $current = 0;
        }

        $timeline = [];
        foreach ($stages as $index => [$value, $label]) {
            $timeline[] = [
                'status' => $value,
                'label'  => $label,
                'time'   => $index <= $current ? 'Just now' : 'Pending',
                'done'   => $index <= $current,
            ];
        }
        return $timeline;
    }

    // -- subscriptions -------------------------------------------------------

    public static function listSubscriptions(RouteContext $ctx): never
    {
        $customer = self::customerFor((string) $ctx->user['id']);
        $rows = Database::all(
            'SELECT * FROM subscription WHERE customer_id = ? ORDER BY created_at DESC, id DESC',
            [$customer['id']]
        );

        Response::json(['subscriptions' => array_map([self::class, 'shapeSubscription'], $rows)]);
    }

    public static function createSubscription(RouteContext $ctx): never
    {
        $user = $ctx->user;
        $customer = self::customerFor((string) $user['id']);

        $stationId = $ctx->str('stationId');
        if ($stationId === '') {
            Response::fail('Choose a station for the subscription.', 400);
        }
        $stationId = self::ensureStation($stationId, $ctx->str('stationName'));

        $frequency = $ctx->str('frequency', 'monthly');
        if (!in_array($frequency, ['weekly', 'biweekly', 'monthly'], true)) {
            $frequency = 'monthly';
        }

        $gallons = max(1, (int) $ctx->input('gallonsPerRefill', 1));
        $basePrice = (float) $ctx->input('basePrice', 0);
        $planId = mb_substr('plan:' . $stationId, 0, 36);

        $plan = Database::one('SELECT id FROM subscription_plan WHERE id = ? LIMIT 1', [$planId]);
        if ($plan === null) {
            Database::run(
                'INSERT INTO subscription_plan (id, station_id, name, gallons_included, price, frequency, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$planId, $stationId, 'Recurring Refill Plan', $gallons, $basePrice, $frequency, 'active']
            );
        }

        $id = Database::uuid();
        $next = date('Y-m-d', strtotime($frequency === 'weekly' ? '+7 days' : ($frequency === 'biweekly' ? '+14 days' : '+30 days')));

        $meta = [
            'stationName'           => $ctx->str('stationName'),
            'frequency'             => $frequency,
            'frequencyLabel'        => $frequency === 'weekly' ? 'Every Week' : ($frequency === 'biweekly' ? 'Every 2 Weeks' : 'Every Month'),
            'containerType'         => $ctx->str('containerType', '5-Gallon Container'),
            'gallonsPerRefill'      => $gallons,
            'basePrice'             => $basePrice,
            'subscriptionDiscount'  => round($basePrice * 0.1, 2),
            'estimatedTotal'        => round($basePrice * 0.9, 2),
            'deliveryAddress'       => $ctx->str('deliveryAddress'),
            'paymentMethod'         => $ctx->str('paymentMethod', 'Cash on Delivery'),
        ];

        Database::run(
            'INSERT INTO subscription (id, customer_id, plan_id, start_date, next_delivery, status, meta, created_at)
             VALUES (?, ?, ?, CURDATE(), ?, ?, ?, NOW())',
            [$id, $customer['id'], $planId, $next, 'active', json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]
        );

        self::notify((string) $user['id'], 'Subscription activated', sprintf('Recurring refill plan registered with %s (10%% discount applied).', $meta['stationName']));

        $row = Database::one('SELECT * FROM subscription WHERE id = ? LIMIT 1', [$id]);
        Response::json(['success' => true, 'subscription' => self::shapeSubscription((array) $row)], 201);
    }

    // -- profile address -----------------------------------------------------

    /**
     * PATCH /api/profile/address — ERD has a single CUSTOMER.default_address,
     * so the newest address becomes the default used at checkout.
     */
    public static function updateAddress(RouteContext $ctx): never
    {
        $customer = self::customerFor((string) $ctx->user['id']);
        $address = $ctx->str('address');
        if ($address === '') {
            Response::fail('Enter a delivery address.', 400);
        }

        Database::run(
            'UPDATE customer SET default_address = ? WHERE id = ?',
            [mb_substr($address, 0, 255), $customer['id']]
        );

        Response::json([
            'success' => true,
            'address' => mb_substr($address, 0, 255),
        ]);
    }

    public static function cancelSubscription(RouteContext $ctx): never
    {
        $customer = self::customerFor((string) $ctx->user['id']);
        $row = Database::one(
            'SELECT * FROM subscription WHERE id = ? AND customer_id = ? LIMIT 1',
            [$ctx->param('id'), $customer['id']]
        );
        if ($row === null) {
            Response::fail('Subscription not found.', 404);
        }

        Database::run("UPDATE subscription SET status = 'cancelled' WHERE id = ?", [$row['id']]);
        $row['status'] = 'cancelled';

        Response::json(['success' => true, 'subscription' => self::shapeSubscription($row)]);
    }

    public static function updateSubscriptionStatus(RouteContext $ctx): never
    {
        $customer = self::customerFor((string) $ctx->user['id']);
        $status = $ctx->str('status');
        if (!in_array($status, ['active', 'paused', 'cancelled'], true)) {
            Response::fail('Unsupported subscription status.', 400);
        }

        $row = Database::one(
            'SELECT * FROM subscription WHERE id = ? AND customer_id = ? LIMIT 1',
            [$ctx->param('id'), $customer['id']]
        );
        if ($row === null) {
            Response::fail('Subscription not found.', 404);
        }

        Database::run('UPDATE subscription SET status = ? WHERE id = ?', [$status, $row['id']]);
        $row['status'] = $status;

        Response::json(['success' => true, 'subscription' => self::shapeSubscription($row)]);
    }

    /** @param array<string,mixed> $row */
    private static function shapeSubscription(array $row): array
    {
        $meta = json_decode((string) ($row['meta'] ?? '{}'), true);
        if (!is_array($meta)) {
            $meta = [];
        }

        $plan = Database::one('SELECT * FROM subscription_plan WHERE id = ? LIMIT 1', [$row['plan_id']]);

        return [
            'id'              => $row['id'],
            'stationId'       => $plan['station_id'] ?? '',
            'stationName'     => $meta['stationName'] ?? '',
            'frequency'       => $meta['frequency'] ?? ($plan['frequency'] ?? 'monthly'),
            'frequencyLabel'  => $meta['frequencyLabel'] ?? '',
            'containerType'   => $meta['containerType'] ?? '5-Gallon Container',
            'gallonsPerRefill' => (int) ($meta['gallonsPerRefill'] ?? ($plan['gallons_included'] ?? 1)),
            'basePrice'       => (float) ($meta['basePrice'] ?? ($plan['price'] ?? 0)),
            'subscriptionDiscount' => (float) ($meta['subscriptionDiscount'] ?? 0),
            'estimatedTotal'  => (float) ($meta['estimatedTotal'] ?? 0),
            'status'          => (string) $row['status'],
            'nextRefillDate'  => $row['next_delivery'] !== null ? 'Next refill on ' . $row['next_delivery'] : '',
            'deliveryAddress' => $meta['deliveryAddress'] ?? '',
            'paymentMethod'   => $meta['paymentMethod'] ?? 'Cash on Delivery',
            'createdAt'       => Dates::iso($row['created_at'] ?? null),
        ];
    }

    // -- loyalty / rewards ---------------------------------------------------

    public static function loyalty(RouteContext $ctx): never
    {
        $customer = self::customerFor((string) $ctx->user['id']);
        $balance = (int) Database::scalar('SELECT aqua_points FROM customer WHERE id = ?', [$customer['id']]);

        $history = [];
        $orders = Database::all(
            'SELECT id, created_at, meta FROM `ORDER` WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20',
            [$customer['id']]
        );
        foreach ($orders as $order) {
            $meta = json_decode((string) ($order['meta'] ?? '{}'), true);
            $earned = (int) ($meta['pointsEarned'] ?? 0);
            if ($earned > 0) {
                $history[] = [
                    'id'     => 'ord-' . $order['id'],
                    'type'   => 'earn',
                    'title'  => 'Refill Order #' . $order['id'],
                    'points' => $earned,
                    'date'   => Dates::iso($order['created_at']),
                ];
            }
        }

        $redeemed = Database::all(
            'SELECT cr.id, cr.points, cr.earned_at, r.name
             FROM customer_reward cr JOIN reward r ON r.id = cr.reward_id
             WHERE cr.customer_id = ? ORDER BY cr.earned_at DESC LIMIT 20',
            [$customer['id']]
        );
        foreach ($redeemed as $row) {
            $history[] = [
                'id'     => $row['id'],
                'type'   => 'redeem',
                'title'  => 'Redeemed: ' . $row['name'],
                'points' => -1 * (int) $row['points'],
                'date'   => Dates::iso($row['earned_at']),
            ];
        }

        usort($history, static fn (array $a, array $b): int => strcmp((string) $b['date'], (string) $a['date']));

        Response::json([
            'balance'        => $balance,
            'tier'           => $balance >= 500 ? 'Gold Refiller' : 'Silver Refiller',
            'nextTierPoints' => 500,
            'history'        => $history,
            'rewardsCatalog' => array_map(static fn (array $r): array => [
                'id'          => $r['id'],
                'name'        => (string) $r['name'],
                'category'    => (string) ($r['category'] ?? 'Reward'),
                'pointsCost'  => (int) ($r['points_cost'] ?? 100),
                'description' => (string) ($r['reward_description'] ?? ''),
                'code'        => (string) ($r['code'] ?? ''),
            ], Database::all("SELECT * FROM reward WHERE status = 'active' ORDER BY points_cost ASC")),
        ]);
    }

    public static function redeemReward(RouteContext $ctx): never
    {
        $user = $ctx->user;
        $customer = self::customerFor((string) $user['id']);
        $rewardId = $ctx->str('rewardId');

        $reward = Database::one('SELECT * FROM reward WHERE id = ? LIMIT 1', [$rewardId]);
        if ($reward === null) {
            Response::fail('Reward not found.', 404);
        }

        $cost = (int) ($reward['points_cost'] ?? 100);
        $balance = (int) Database::scalar('SELECT aqua_points FROM customer WHERE id = ?', [$customer['id']]);
        if ($balance < $cost) {
            Response::fail(sprintf('Insufficient points. You need %d but have %d.', $cost, $balance), 400);
        }

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            Database::run('UPDATE customer SET aqua_points = aqua_points - ? WHERE id = ?', [$cost, $customer['id']]);
            Database::run(
                'INSERT INTO customer_reward (id, customer_id, reward_id, points, reason, earned_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [Database::uuid(), $customer['id'], $rewardId, $cost, 'Redeemed']
            );
            self::notify((string) $user['id'], 'Reward redeemed', sprintf('You claimed "%s". Voucher code: %s.', $reward['name'], $reward['code'] ?? ''));
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            Response::fail('Could not redeem the reward: ' . $e->getMessage(), 500);
        }

        Response::json([
            'success'          => true,
            'reward'           => [
                'id'         => $reward['id'],
                'name'       => (string) $reward['name'],
                'pointsCost' => $cost,
                'code'       => (string) ($reward['code'] ?? ''),
            ],
            'remainingBalance' => $balance - $cost,
        ]);
    }

    // -- notifications -------------------------------------------------------

    public static function listNotifications(RouteContext $ctx): never
    {
        $rows = Database::all(
            'SELECT * FROM notification WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [(string) $ctx->user['id']]
        );

        Response::json(['notifications' => array_map([self::class, 'shapeNotification'], $rows)]);
    }

    public static function createNotification(RouteContext $ctx): never
    {
        $id = Database::uuid();
        Database::run(
            'INSERT INTO notification (id, user_id, title, body, `read`, created_at) VALUES (?, ?, ?, ?, 0, NOW())',
            [$id, (string) $ctx->user['id'], $ctx->str('title', 'Notification'), $ctx->str('message')]
        );

        $row = Database::one('SELECT * FROM notification WHERE id = ? LIMIT 1', [$id]);
        Response::json(['success' => true, 'notification' => self::shapeNotification((array) $row)], 201);
    }

    public static function markNotificationsRead(RouteContext $ctx): never
    {
        $userId = (string) $ctx->user['id'];
        Database::run('UPDATE notification SET `read` = 1 WHERE user_id = ?', [$userId]);

        $rows = Database::all(
            'SELECT * FROM notification WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [$userId]
        );

        Response::json([
            'success'       => true,
            'notifications' => array_map([self::class, 'shapeNotification'], $rows),
        ]);
    }

    /** @param array<string,mixed> $row */
    private static function shapeNotification(array $row): array
    {
        return [
            'id'      => $row['id'],
            'title'   => (string) $row['title'],
            'message' => (string) $row['body'],
            'type'    => 'info',
            'time'    => Dates::iso($row['created_at']),
            'read'    => (bool) $row['read'],
        ];
    }

    private static function notify(string $userId, string $title, string $body): void
    {
        Database::run(
            'INSERT INTO notification (id, user_id, title, body, `read`, created_at) VALUES (?, ?, ?, ?, 0, NOW())',
            [Database::uuid(), $userId, $title, $body]
        );
    }
}
