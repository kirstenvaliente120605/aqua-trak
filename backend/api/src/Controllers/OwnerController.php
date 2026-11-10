<?php
/**
 * Station-owner workspace backed by the ERD schema.
 *
 * Orders, customers, pricing, inventory, subscriptions and promotions all come
 * from the shared tables so the owner dashboard sees the same data customers
 * and staff work with. Station settings live in STATION.operating_hours as a
 * small JSON document because the ERD has no separate settings table.
 */

declare(strict_types=1);

namespace AquaTracker;

final class OwnerController
{
    private const REFILL_TYPES = ['5-gal-slim', '5-gal-round'];
    private const INVENTORY_TYPES = ['caps', 'seals', 'bottles'];

    /** Resolve (and create on first login) the station owned by this user. */
    public static function stationId(array $user): string
    {
        $userId = (string) ($user['id'] ?? '');
        if ($userId === '') {
            return '';
        }

        $requestedId = trim((string) ($_GET['stationId'] ?? ''));
        if ($requestedId !== '') {
            $owned = Database::scalar(
                'SELECT id FROM station WHERE id = ? AND owner_id = (SELECT id FROM station_owner WHERE user_id = ? LIMIT 1) LIMIT 1',
                [$requestedId, $userId]
            );
            if ($owned !== null) {
                return (string) $owned;
            }
        }

        $owner = Database::one('SELECT * FROM station_owner WHERE user_id = ? LIMIT 1', [$userId]);
        if ($owner === null) {
            $ownerId = Database::nextReadableId('owners');
            $ownerName = trim((string) ($user['name'] ?? '')) ?: 'Station Owner';
            Database::run(
                'INSERT INTO station_owner (id, user_id, owner_name) VALUES (?, ?, ?)',
                [$ownerId, $userId, mb_substr($ownerName, 0, 190)]
            );
            $owner = ['id' => $ownerId, 'owner_name' => $ownerName];
        }

        $existing = Database::scalar('SELECT id FROM station WHERE owner_id = ? ORDER BY id ASC LIMIT 1', [$owner['id']]);
        if ($existing !== null) {
            return (string) $existing;
        }

        $name = trim((string) ($user['station'] ?? '')) ?: 'My Water Station';
        $stationId = Database::nextReadableId('stations');
        Database::run(
            'INSERT INTO station (id, owner_id, name, address, operating_hours, status)
             VALUES (?, ?, ?, ?, ?, ?)',
            [
                $stationId,
                $owner['id'],
                mb_substr($name, 0, 190),
                '',
                json_encode(['hours' => 'Mon-Sat 7:30 AM-5:00 PM', 'contact' => (string) ($user['phone'] ?? '')]),
                'open',
            ]
        );

        return $stationId;
    }

    /** GET /api/owner/stations — all stations owned by this account. */
    public static function listStations(RouteContext $ctx): never
    {
        self::stationId($ctx->user);
        $ownerId = (string) Database::scalar(
            'SELECT id FROM station_owner WHERE user_id = ? LIMIT 1',
            [(string) $ctx->user['id']]
        );
        $stations = Database::all(
            'SELECT id, name, address, status FROM station WHERE owner_id = ? ORDER BY id ASC',
            [$ownerId]
        );
        Response::json(['stations' => $stations]);
    }

    /** POST /api/owner/stations — add another station for this owner. */
    public static function createStation(RouteContext $ctx): never
    {
        $name = trim($ctx->str('name'));
        $address = trim($ctx->str('address'));
        $hours = trim($ctx->str('hours'));
        $contact = trim($ctx->str('contact'));
        $rawLat = $ctx->input('lat');
        $rawLng = $ctx->input('lng');
        if ($name === '' || mb_strlen($name) > 190) {
            Response::fail('Enter a station name (up to 190 characters).', 400);
        }
        if (!is_numeric($rawLat) || !is_numeric($rawLng)) {
            Response::fail('Enter both latitude and longitude.', 400);
        }
        $lat = (float) $rawLat;
        $lng = (float) $rawLng;
        if (!is_finite($lat) || !is_finite($lng) || $lat < -90 || $lat > 90 || $lng < -180 || $lng > 180 || $lat === 0.0 || $lng === 0.0) {
            Response::fail('Enter valid non-zero coordinates within latitude -90..90 and longitude -180..180.', 400);
        }

        self::stationId($ctx->user);
        $ownerId = (string) Database::scalar(
            'SELECT id FROM station_owner WHERE user_id = ? LIMIT 1',
            [(string) $ctx->user['id']]
        );
        $stationId = Database::nextReadableId('stations');
        $settings = json_encode(['hours' => $hours, 'contact' => $contact], JSON_UNESCAPED_SLASHES);
        Database::run(
            'INSERT INTO station (id, owner_id, name, address, lat, lng, operating_hours, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$stationId, $ownerId, $name, mb_substr($address, 0, 255), $lat, $lng, $settings, 'open']
        );
        Response::json(['station' => [
            'id' => $stationId,
            'owner_id' => $ownerId,
            'name' => $name,
            'address' => $address,
            'lat' => $lat,
            'lng' => $lng,
            'status' => 'open',
        ]]);
    }

    public static function stationName(string $stationId): string
    {
        $name = Database::scalar('SELECT name FROM station WHERE id = ? LIMIT 1', [$stationId]);
        return $name === null ? 'Water Refilling Station' : (string) $name;
    }

    private static function stationRow(string $stationId): array
    {
        $row = Database::one('SELECT * FROM station WHERE id = ? LIMIT 1', [$stationId]);
        return $row === null ? [] : $row;
    }

    // -- overview ------------------------------------------------------------

    public static function overview(RouteContext $ctx): never
    {
        $stationId = self::stationId($ctx->user);
        $orders = self::ordersForStation($stationId);
        $today = Dates::today();

        $revenue = 0.0;
        $customers = [];
        $ordersToday = 0;
        foreach ($orders as $order) {
            if (strtolower((string) $order['status']) !== 'cancelled') {
                $revenue += (float) $order['total'];
            }
            $customers[(string) ($order['customerId'] ?? $order['customerName'])] = true;
            if (str_starts_with((string) $order['createdAt'], $today)) {
                $ordersToday++;
            }
        }

        Response::json([
            'revenue' => round($revenue, 2),
            'orderVolume' => count($orders),
            'ordersToday' => $ordersToday,
            'customerCount' => count($customers),
        ]);
    }

    // -- orders --------------------------------------------------------------

    /** @return list<array<string,mixed>> */
    public static function ordersForStation(string $stationId): array
    {
        $rows = Database::all(
            'SELECT o.*, c.user_id AS customer_user_id,
                    COALESCE(u.full_name, u.name, "") AS customer_name
             FROM `ORDER` o
             LEFT JOIN customer c ON c.id = o.customer_id
             LEFT JOIN user u ON u.id = c.user_id
             WHERE o.station_id = ?
             ORDER BY o.created_at DESC, o.id DESC',
            [$stationId]
        );

        $stationName = self::stationName($stationId);
        return array_map(
            static fn (array $row): array => self::shapeOrder($row, $stationName),
            $rows
        );
    }

    public static function listOrders(RouteContext $ctx): never
    {
        Response::json(['orders' => self::ordersForStation(self::stationId($ctx->user))]);
    }

    public static function updateOrder(RouteContext $ctx): never
    {
        $stationId = self::stationId($ctx->user);
        $order = Database::one(
            'SELECT * FROM `ORDER` WHERE id = ? AND station_id = ? LIMIT 1',
            [$ctx->param('id'), $stationId]
        );
        if ($order === null) {
            Response::fail('Order not found for your station.', 404);
        }

        $meta = json_decode((string) ($order['meta'] ?? '{}'), true);
        if (!is_array($meta)) {
            $meta = [];
        }

        $fields = [];
        $values = [];

        $status = trim((string) $ctx->input('status', ''));
        if ($status !== '') {
            $normalized = self::normalizeStatus($status, (string) $order['type']);
            $allowed = ['new', 'pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out-for-delivery', 'completed', 'cancelled'];
            if (!in_array($normalized, $allowed, true)) {
                Response::fail('Unsupported order status.', 400);
            }
            $fields[] = 'status = ?';
            $values[] = $normalized;
        }

        $paymentStatus = trim((string) $ctx->input('paymentStatus', ''));
        if ($paymentStatus !== '') {
            if (!in_array($paymentStatus, ['paid', 'unpaid', 'refunded'], true)) {
                Response::fail('Unsupported payment status.', 400);
            }
            $meta['paymentStatus'] = $paymentStatus;
        }

        $note = $ctx->input('internalNote');
        if (is_string($note)) {
            $meta['internalNote'] = mb_substr(trim($note), 0, 1000);
        }

        if ($fields === [] && $meta === json_decode((string) ($order['meta'] ?? '{}'), true)) {
            Response::fail('Nothing to update.', 400);
        }

        $fields[] = 'meta = ?';
        $values[] = json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $values[] = $order['id'];

        Database::run('UPDATE `ORDER` SET ' . implode(', ', $fields) . ' WHERE id = ?', $values);

        $fresh = Database::one('SELECT * FROM `ORDER` WHERE id = ? LIMIT 1', [$order['id']]);
        Response::json([
            'success' => true,
            'order' => self::shapeOrder((array) $fresh, self::stationName($stationId)),
        ]);
    }

    private static function normalizeStatus(string $status, string $fulfillment): string
    {
        $key = strtolower(trim($status));
        $map = [
            'new order' => 'new',
            'new' => 'new',
            'pending' => 'pending',
            'confirmed' => 'confirmed',
            'preparing' => $fulfillment === 'pickup' ? 'preparing' : 'confirmed',
            'ready for pickup' => 'ready_for_pickup',
            'ready' => 'ready_for_pickup',
            'ready_for_pickup' => 'ready_for_pickup',
            'out for delivery' => 'out-for-delivery',
            'out-for-delivery' => 'out-for-delivery',
            'delivered' => 'completed',
            'complete' => 'completed',
            'completed' => 'completed',
            'cancelled' => 'cancelled',
            'canceled' => 'cancelled',
        ];

        return $map[$key] ?? $key;
    }

    /** @param array<string,mixed> $row */
    private static function shapeOrder(array $row, string $stationName): array
    {
        $meta = json_decode((string) ($row['meta'] ?? '{}'), true);
        if (!is_array($meta)) {
            $meta = [];
        }

        $gallons = (int) Database::scalar(
            'SELECT COALESCE(SUM(qty), 0) FROM order_item WHERE order_id = ?',
            [$row['id']]
        );
        if ($gallons === 0) {
            $gallons = (int) ($meta['gallonsTotal'] ?? 0);
        }

        $customerName = trim((string) ($row['customer_name'] ?? ''));
        if ($customerName === '') {
            $customerName = (string) ($meta['customerName'] ?? 'Customer');
        }

        return [
            'id' => $row['id'],
            'userId' => $row['customer_user_id'] ?? null,
            'customerId' => $row['customer_id'],
            'customerName' => $customerName,
            'stationId' => $row['station_id'],
            'stationName' => $meta['stationName'] ?? $stationName,
            'gallons' => $gallons,
            'fulfillment' => $row['type'],
            'status' => (string) $row['status'],
            'total' => (float) $row['total'],
            'subtotal' => (float) ($meta['subtotal'] ?? $row['total']),
            'discount' => (float) ($meta['discount'] ?? 0),
            'deliveryFee' => (float) ($meta['deliveryFee'] ?? 0),
            'paymentMethod' => (string) ($meta['paymentMethod'] ?? 'cod'),
            'paymentStatus' => (string) ($meta['paymentStatus'] ?? 'paid'),
            'contactPhone' => (string) ($meta['contactPhone'] ?? ''),
            'deliveryAddress' => (string) ($meta['deliveryAddress'] ?? ''),
            'notes' => (string) ($meta['notes'] ?? ''),
            'createdAt' => Dates::iso($row['created_at']),
        ];
    }

    // -- customers -----------------------------------------------------------

    public static function listCustomers(RouteContext $ctx): never
    {
        $rows = Database::all(
            'SELECT c.id AS customer_id, c.user_id, COALESCE(u.full_name, u.name, "") AS name,
                    u.email, u.phone, COUNT(o.id) AS order_count,
                    COALESCE(SUM(o.total), 0) AS total_spent, MAX(o.created_at) AS last_order
             FROM `ORDER` o
             JOIN customer c ON c.id = o.customer_id
             LEFT JOIN user u ON u.id = c.user_id
             WHERE o.station_id = ?
             GROUP BY c.id, c.user_id, u.full_name, u.name, u.email, u.phone
             ORDER BY last_order DESC',
            [self::stationId($ctx->user)]
        );

        Response::json(['customers' => array_map(static fn (array $r): array => [
            'id' => $r['customer_id'],
            'userId' => $r['user_id'],
            'name' => trim((string) $r['name']) ?: 'Customer',
            'email' => (string) ($r['email'] ?? ''),
            'phone' => (string) ($r['phone'] ?? ''),
            'orderCount' => (int) $r['order_count'],
            'totalSpent' => round((float) $r['total_spent'], 2),
            'lastOrder' => Dates::iso($r['last_order']),
        ], $rows)]);
    }

    // -- pricing -------------------------------------------------------------

    public static function getPricing(RouteContext $ctx): never
    {
        Response::json(['pricing' => self::pricingForStation(self::stationId($ctx->user))]);
    }

    /** @return array<string,float> */
    private static function pricingForStation(string $stationId): array
    {
        $in = implode(',', array_fill(0, count(self::REFILL_TYPES), '?'));
        $rows = Database::all(
            "SELECT p.type,
                    (SELECT pr.price FROM pricing pr WHERE pr.product_id = p.id
                     ORDER BY pr.effective_from DESC, pr.id DESC LIMIT 1) AS price
             FROM product p
             WHERE p.station_id = ? AND p.type IN ($in)
             ORDER BY p.type ASC",
            array_merge([$stationId], self::REFILL_TYPES)
        );

        $pricing = [];
        foreach ($rows as $row) {
            $pricing[(string) $row['type']] = (float) ($row['price'] ?? 0);
        }
        return $pricing;
    }

    public static function updatePricing(RouteContext $ctx): never
    {
        $pricing = $ctx->input('pricing');
        if (!is_array($pricing)) {
            Response::fail('Pricing must be an object of container prices.', 400);
        }

        $stationId = self::stationId($ctx->user);
        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            foreach ($pricing as $type => $price) {
                $type = trim((string) $type);
                if ($type === '' || !is_numeric($price) || (float) $price < 0) {
                    continue;
                }

                $product = Database::one(
                    'SELECT id FROM product WHERE station_id = ? AND type = ? LIMIT 1',
                    [$stationId, $type]
                );
                if ($product === null) {
                    $productId = mb_substr($stationId . ':' . $type, 0, 36);
                    Database::run(
                        'INSERT INTO product (id, station_id, name, unit, stock_qty, type)
                         VALUES (?, ?, ?, ?, 0, ?)',
                        [$productId, $stationId, self::productLabel($type), 'refill', $type]
                    );
                } else {
                    $productId = (string) $product['id'];
                }

                $current = Database::one(
                    'SELECT id FROM pricing WHERE product_id = ?
                     ORDER BY effective_from DESC, id DESC LIMIT 1',
                    [$productId]
                );
                if ($current === null) {
                    Database::run(
                        'INSERT INTO pricing (id, product_id, price) VALUES (?, ?, ?)',
                        [Database::uuid(), $productId, (float) $price]
                    );
                } else {
                    Database::run(
                        'UPDATE pricing SET price = ? WHERE id = ?',
                        [(float) $price, $current['id']]
                    );
                }
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            Response::fail('Could not save pricing: ' . $e->getMessage(), 500);
        }

        Response::json(['success' => true, 'pricing' => self::pricingForStation($stationId)]);
    }

    private static function productLabel(string $type): string
    {
        $labels = [
            '5-gal-slim' => '5-Gallon Slim',
            '5-gal-round' => '5-Gallon Round',
            'caps' => 'Sanitary caps',
            'seals' => 'Bottle seals',
            'bottles' => 'Refill bottles',
        ];
        return $labels[$type] ?? ucwords(str_replace(['-', '_'], ' ', $type));
    }

    // -- inventory -----------------------------------------------------------

    public static function getInventory(RouteContext $ctx): never
    {
        Response::json(['inventory' => self::inventoryForStation(self::stationId($ctx->user))]);
    }

    /** @return array<string,int> */
    private static function inventoryForStation(string $stationId): array
    {
        $in = implode(',', array_fill(0, count(self::INVENTORY_TYPES), '?'));
        $rows = Database::all(
            "SELECT type, stock_qty FROM product WHERE station_id = ? AND type IN ($in)",
            array_merge([$stationId], self::INVENTORY_TYPES)
        );

        $inventory = array_fill_keys(self::INVENTORY_TYPES, 0);
        foreach ($rows as $row) {
            $inventory[(string) $row['type']] = (int) $row['stock_qty'];
        }
        return $inventory;
    }

    // -- settings ------------------------------------------------------------

    public static function getSettings(RouteContext $ctx): never
    {
        Response::json(['settings' => self::settingsFor(self::stationId($ctx->user))]);
    }

    /** @return array<string,mixed> */
    private static function settingsFor(string $stationId): array
    {
        $row = self::stationRow($stationId);
        $hours = json_decode((string) ($row['operating_hours'] ?? ''), true);

        if (is_array($hours)) {
            $hoursText = (string) ($hours['hours'] ?? '');
            $contact = (string) ($hours['contact'] ?? '');
        } else {
            $hoursText = is_string($hours) ? $hours : '';
            $contact = '';
        }

        return [
            'id' => $stationId,
            'name' => (string) ($row['name'] ?? ''),
            'address' => (string) ($row['address'] ?? ''),
            'hours' => $hoursText !== '' ? $hoursText : 'Mon-Sat 7:30 AM-5:00 PM',
            'contact' => $contact,
            'status' => (string) ($row['status'] ?? 'open'),
        ];
    }

    public static function updateSettings(RouteContext $ctx): never
    {
        $settings = $ctx->input('settings');
        if (!is_array($settings)) {
            Response::fail('Settings must be an object.', 400);
        }

        $name = trim((string) ($settings['name'] ?? ''));
        $address = trim((string) ($settings['address'] ?? ''));
        if ($name === '' || strlen($name) > 190 || strlen($address) > 255) {
            Response::fail('Enter a station name and a valid address.', 400);
        }

        $stationId = self::stationId($ctx->user);
        $hours = [
            'hours' => mb_substr(trim((string) ($settings['hours'] ?? '')), 0, 190),
            'contact' => mb_substr(trim((string) ($settings['contact'] ?? '')), 0, 40),
        ];

        Database::run(
            'UPDATE station SET name = ?, address = ?, operating_hours = ? WHERE id = ?',
            [$name, $address, json_encode($hours, JSON_UNESCAPED_SLASHES), $stationId]
        );

        Response::json(['success' => true, 'settings' => self::settingsFor($stationId)]);
    }

    // -- team ----------------------------------------------------------------

    public static function listStaff(RouteContext $ctx): never
    {
        $rows = Database::all(
            'SELECT u.* FROM staff st
             JOIN user u ON u.id = st.user_id
             WHERE st.station_id = ?
             ORDER BY u.full_name ASC, u.name ASC',
            [self::stationId($ctx->user)]
        );

        Response::json(['staff' => array_map(static fn (array $r): array => [
            'id' => $r['id'],
            'name' => (string) ($r['full_name'] ?: $r['name']),
            'email' => (string) $r['email'],
            'phone' => (string) ($r['phone'] ?? ''),
            'role' => (string) $r['role'],
            'status' => (string) ($r['status'] ?? 'active'),
            'createdAt' => Dates::iso($r['created_at'] ?? null),
        ], $rows)]);
    }

    // -- subscriptions -------------------------------------------------------

    public static function listSubscriptions(RouteContext $ctx): never
    {
        $rows = Database::all(
            'SELECT s.*, p.name AS plan_name, p.station_id, p.frequency AS plan_frequency,
                    p.gallons_included, p.price AS plan_price,
                    COALESCE(u.full_name, u.name, "") AS customer_name
             FROM subscription s
             JOIN subscription_plan p ON p.id = s.plan_id
             LEFT JOIN customer c ON c.id = s.customer_id
             LEFT JOIN user u ON u.id = c.user_id
             WHERE p.station_id = ?
             ORDER BY s.created_at DESC, s.id DESC',
            [self::stationId($ctx->user)]
        );

        Response::json(['subscriptions' => array_map(static function (array $row): array {
            $meta = json_decode((string) ($row['meta'] ?? '{}'), true);
            if (!is_array($meta)) {
                $meta = [];
            }
            return [
                'id' => $row['id'],
                'planName' => (string) ($row['plan_name'] ?? 'Recurring refill plan'),
                'customerName' => trim((string) $row['customer_name']) ?: 'Station customer',
                'gallons' => (int) ($meta['gallonsPerRefill'] ?? $row['gallons_included'] ?? 0),
                'frequency' => (string) ($meta['frequencyLabel'] ?? $meta['frequency'] ?? $row['plan_frequency'] ?? ''),
                'estimatedTotal' => (float) ($meta['estimatedTotal'] ?? $row['plan_price'] ?? 0),
                'status' => (string) $row['status'],
                'nextRefill' => Dates::iso($row['next_delivery'] ?? null),
            ];
        }, $rows)]);
    }

    // -- promotions ----------------------------------------------------------

    public static function listPromotions(RouteContext $ctx): never
    {
        $station = self::stationRow(self::stationId($ctx->user));
        $ownerId = (string) ($station['owner_id'] ?? '');
        if ($ownerId === '') {
            Response::json(['promotions' => []]);
        }

        $rows = Database::all(
            'SELECT * FROM promotion WHERE owner_id = ? ORDER BY expires_at DESC, code ASC',
            [$ownerId]
        );

        Response::json(['promotions' => array_map([self::class, 'shapePromotion'], $rows)]);
    }

    public static function createPromotion(RouteContext $ctx): never
    {
        $station = self::stationRow(self::stationId($ctx->user));
        $ownerId = (string) ($station['owner_id'] ?? '');
        if ($ownerId === '') {
            Response::fail('No station owner profile was found for this account.', 400);
        }

        $code = strtoupper(trim((string) $ctx->input('code', '')));
        $type = strtolower(trim((string) $ctx->input('type', 'percent')));
        $value = (float) $ctx->input('value', 0);
        $expiry = trim((string) $ctx->input('expiresAt', ''));

        if (!preg_match('/^[A-Z0-9_-]{3,30}$/', $code)) {
            Response::fail('Use 3-30 letters, numbers, hyphens or underscores for the offer code.', 400);
        }
        if (!in_array($type, ['percent', 'fixed', 'delivery'], true)) {
            Response::fail('Choose a valid promotion type.', 400);
        }
        if ($type === 'percent' && ($value <= 0 || $value > 100)) {
            Response::fail('Percentage discounts must be greater than 0 and at most 100.', 400);
        }
        if ($type === 'fixed' && $value <= 0) {
            Response::fail('Fixed discounts must be greater than 0.', 400);
        }
        if ($type === 'delivery') {
            $value = 0;
        }

        $expiresAt = null;
        if ($expiry !== '') {
            $timestamp = strtotime($expiry);
            if ($timestamp === false) {
                Response::fail('Choose a valid expiry date.', 400);
            }
            if ($timestamp < strtotime(Dates::today())) {
                Response::fail('The expiry date cannot be in the past.', 400);
            }
            $expiresAt = date('Y-m-d', $timestamp);
        }

        $promotionId = Database::uuid();
        try {
            Database::run(
                'INSERT INTO promotion (id, owner_id, code, type, value, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
                [$promotionId, $ownerId, $code, $type, $value, $expiresAt]
            );
        } catch (\PDOException $error) {
            if (($error->errorInfo[1] ?? 0) === 1062) {
                Response::fail('That promotion code is already in use.', 409);
            }
            throw $error;
        }

        $row = Database::one('SELECT * FROM promotion WHERE id = ? LIMIT 1', [$promotionId]);
        Response::json([
            'success' => true,
            'promotion' => self::shapePromotion($row ?? []),
        ], 201);
    }

    /** @param array<string,mixed> $row @return array<string,mixed> */
    private static function shapePromotion(array $row): array
    {
        $expired = ($row['expires_at'] ?? null) !== null
            && strtotime((string) $row['expires_at']) < strtotime(Dates::today());
        $type = strtolower((string) ($row['type'] ?? 'offer'));
        $value = (float) ($row['value'] ?? 0);
        if (str_contains($type, 'delivery')) {
            $detail = 'Free delivery on eligible refill orders';
        } elseif (str_contains($type, 'percent')) {
            $detail = sprintf('%s%% off eligible refills', rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.'));
        } else {
            $detail = sprintf('Php %s off eligible refills', number_format($value, 2));
        }

        return [
            'id' => $row['id'] ?? null,
            'name' => ucwords(str_replace(['-', '_'], ' ', (string) ($row['code'] ?? ''))),
            'detail' => $detail,
            'code' => (string) ($row['code'] ?? ''),
            'status' => $expired ? 'Expired' : 'Active',
            'redemptions' => 0,
            'expiry' => Dates::iso($row['expires_at'] ?? null),
        ];
    }
}
