<?php
/**
 * Station-staff workspace backed by the ERD schema.
 *
 * Orders and inventory are the shared ERD rows, scoped to the staff member's
 * STAFF.station_id. The ERD has no shift, customer-request or inventory-report
 * tables, so those read-only demo sections remain in the frontend's local
 * prototype store while every action button writes to the database.
 */

declare(strict_types=1);

namespace AquaTracker;

final class StaffController
{
    private const ACTIVE_STATUSES = ['new', 'pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out-for-delivery'];
    private const INVENTORY_TYPES = ['caps', 'seals', 'bottles'];
    private const REORDER_AT = ['caps' => 30, 'seals' => 15, 'bottles' => 4];

    private static function stationId(array $user): string
    {
        $userId = (string) ($user['id'] ?? '');

        if ($userId !== '') {
            $station = Database::scalar(
                'SELECT station_id FROM staff WHERE user_id = ? ORDER BY id ASC LIMIT 1',
                [$userId]
            );
            if ($station !== null && (string) $station !== '') {
                return (string) $station;
            }

            $sessionStation = trim((string) ($user['stationId'] ?? ''));
            if ($sessionStation !== '') {
                return $sessionStation;
            }

            $name = trim((string) ($user['station'] ?? ''));
            if ($name !== '') {
                $byName = Database::scalar('SELECT id FROM station WHERE name = ? LIMIT 1', [$name]);
                if ($byName !== null) {
                    return (string) $byName;
                }
            }
        }

        return (string) (Database::scalar('SELECT id FROM station ORDER BY id ASC LIMIT 1') ?? '');
    }

    private static function stationName(string $stationId): string
    {
        $name = Database::scalar('SELECT name FROM station WHERE id = ? LIMIT 1', [$stationId]);
        return $name === null ? 'Assigned station' : (string) $name;
    }

    // -- overview ------------------------------------------------------------

    public static function overview(RouteContext $ctx): never
    {
        $stationId = self::stationId($ctx->user);
        $orders = self::ordersForStation($stationId);
        $inventory = self::inventoryForStation($stationId);

        $pending = array_values(array_filter(
            $orders,
            static fn (array $order): bool => in_array(strtolower((string) $order['status']), self::ACTIVE_STATUSES, true)
        ));

        $alerts = [];
        foreach ($inventory as $type => $item) {
            if ($item['quantity'] <= $item['reorderAt']) {
                $alerts[] = [
                    'id' => $item['id'],
                    'label' => $item['name'] . ' is low',
                    'detail' => sprintf('%d %s remaining - reorder at %d', $item['quantity'], $item['unit'], $item['reorderAt']),
                ];
            }
        }

        $completed = array_slice(array_values(array_filter(
            $orders,
            static fn (array $order): bool => strtolower((string) $order['status']) === 'completed'
        )), 0, 5);

        Response::json([
            'stationId' => $stationId,
            'stationName' => self::stationName($stationId),
            'metrics' => [
                'assignedOrders' => count($pending),
                'ready' => count(array_filter(
                    $orders,
                    static fn (array $order): bool => strtolower((string) $order['status']) === 'ready_for_pickup'
                )),
                'openRequests' => 0,
                'lowStock' => count($alerts),
            ],
            'orders' => array_slice($orders, 0, 5),
            'pendingOrders' => array_slice($pending, 0, 5),
            'completedTasks' => array_map(static fn (array $order): array => [
                'id' => $order['id'],
                'label' => sprintf('Order %s completed', $order['id']),
                'detail' => sprintf('%s - %d gallons', $order['customerName'], $order['gallons']),
                'completedAt' => $order['createdAt'],
            ], $completed),
            'inventoryAlerts' => $alerts,
            'currentShift' => null,
            'nextShift' => null,
            'notifications' => self::notificationsFor((string) $ctx->user['id']),
        ]);
    }

    // -- orders --------------------------------------------------------------

    /** @return list<array<string,mixed>> */
    private static function ordersForStation(string $stationId): array
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
        $orders = self::ordersForStation(self::stationId($ctx->user));

        $status = strtolower(trim((string) $ctx->input('status', '')));
        $search = strtolower(trim((string) $ctx->input('search', '')));

        if ($status !== '' && $status !== 'all') {
            $orders = array_values(array_filter(
                $orders,
                static fn (array $order): bool => strtolower((string) $order['status']) === $status
            ));
        }

        if ($search !== '') {
            $orders = array_values(array_filter($orders, static function (array $order) use ($search): bool {
                $haystack = strtolower(implode(' ', [
                    (string) $order['id'],
                    (string) $order['customerName'],
                    (string) $order['stationName'],
                ]));
                return str_contains($haystack, $search);
            }));
        }

        Response::json([
            'stationId' => self::stationId($ctx->user),
            'stationName' => self::stationName(self::stationId($ctx->user)),
            'statuses' => self::ACTIVE_STATUSES,
            'orders' => $orders,
        ]);
    }

    public static function showOrder(RouteContext $ctx): never
    {
        $order = self::findOrder($ctx);
        Response::json(['order' => $order]);
    }

    public static function updateOrder(RouteContext $ctx): never
    {
        $stationId = self::stationId($ctx->user);
        $order = self::findOrder($ctx);

        $fields = [];
        $values = [];
        $meta = self::orderMeta($order['id']);

        $status = trim((string) $ctx->input('status', ''));
        if ($status !== '') {
            $fields[] = 'status = ?';
            $values[] = self::normalizeStatus($status, (string) $order['fulfillment']);
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

        if ($fields === [] && $meta === self::orderMeta($order['id'])) {
            Response::fail('Nothing to update.', 400);
        }

        $fields[] = 'meta = ?';
        $values[] = json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $values[] = $order['id'];
        $values[] = $stationId;

        Database::run(
            'UPDATE `ORDER` SET ' . implode(', ', $fields) . ' WHERE id = ? AND station_id = ?',
            $values
        );

        $fresh = Database::one('SELECT * FROM `ORDER` WHERE id = ? LIMIT 1', [$order['id']]);
        Response::json([
            'success' => true,
            'order' => self::shapeOrder((array) $fresh, self::stationName($stationId)),
        ]);
    }

    /** @return array<string,mixed> */
    private static function findOrder(RouteContext $ctx): array
    {
        $stationId = self::stationId($ctx->user);
        $row = Database::one(
            'SELECT o.*, c.user_id AS customer_user_id,
                    COALESCE(u.full_name, u.name, "") AS customer_name
             FROM `ORDER` o
             LEFT JOIN customer c ON c.id = o.customer_id
             LEFT JOIN user u ON u.id = c.user_id
             WHERE o.id = ? AND o.station_id = ? LIMIT 1',
            [$ctx->param('id'), $stationId]
        );
        if ($row === null) {
            Response::fail('Order not found for your assigned station.', 404);
        }

        return self::shapeOrder($row, self::stationName($stationId));
    }

    /** @return array<string,mixed> */
    private static function orderMeta(string $orderId): array
    {
        $meta = Database::scalar('SELECT meta FROM `ORDER` WHERE id = ? LIMIT 1', [$orderId]);
        $decoded = json_decode((string) ($meta ?? '{}'), true);
        return is_array($decoded) ? $decoded : [];
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

        $value = $map[$key] ?? $key;
        $allowed = array_merge(self::ACTIVE_STATUSES, ['completed', 'cancelled']);
        if (!in_array($value, $allowed, true)) {
            Response::fail('Unsupported order status.', 400);
        }

        return $value;
    }

    /** @param array<string,mixed> $row */
    private static function shapeOrder(array $row, string $stationName): array
    {
        $meta = json_decode((string) ($row['meta'] ?? '{}'), true);
        if (!is_array($meta)) {
            $meta = [];
        }

        $items = Database::all(
            'SELECT oi.qty, oi.unit_price, p.name, p.type
             FROM order_item oi
             LEFT JOIN product p ON p.id = oi.product_id
             WHERE oi.order_id = ?',
            [$row['id']]
        );
        $shapedItems = array_map(static fn (array $item): array => [
            'productId' => null,
            'type' => (string) ($item['type'] ?? 'refill'),
            'label' => (string) ($item['name'] ?? 'Refill'),
            'count' => (int) $item['qty'],
            'unitPrice' => (float) $item['unit_price'],
        ], $items);

        $gallons = array_sum(array_column($shapedItems, 'count'));
        if ($gallons === 0) {
            $gallons = (int) ($meta['gallonsTotal'] ?? 0);
        }

        $customerName = trim((string) ($row['customer_name'] ?? ''));
        if ($customerName === '') {
            $customerName = (string) ($meta['customerName'] ?? 'Customer');
        }

        return [
            'id' => $row['id'],
            'customerId' => $row['customer_id'],
            'userId' => $row['customer_user_id'] ?? null,
            'customerName' => $customerName,
            'stationId' => $row['station_id'],
            'stationName' => $meta['stationName'] ?? $stationName,
            'items' => $shapedItems,
            'gallons' => $gallons,
            'fulfillment' => $row['type'],
            'status' => (string) $row['status'],
            'total' => (float) $row['total'],
            'paymentMethod' => (string) ($meta['paymentMethod'] ?? 'cod'),
            'paymentStatus' => (string) ($meta['paymentStatus'] ?? 'paid'),
            'contactPhone' => (string) ($meta['contactPhone'] ?? ''),
            'notes' => (string) ($meta['notes'] ?? ''),
            'deliveryAddress' => (string) ($meta['deliveryAddress'] ?? ''),
            'createdAt' => Dates::iso($row['created_at']),
        ];
    }

    // -- inventory -----------------------------------------------------------

    /** @return list<array<string,mixed>> */
    private static function inventoryForStation(string $stationId): array
    {
        $in = implode(',', array_fill(0, count(self::INVENTORY_TYPES), '?'));
        $rows = Database::all(
            "SELECT * FROM product WHERE station_id = ? AND type IN ($in) ORDER BY type ASC",
            array_merge([$stationId], self::INVENTORY_TYPES)
        );

        $byType = [];
        foreach ($rows as $row) {
            $byType[(string) $row['type']] = $row;
        }

        $items = [];
        foreach (self::INVENTORY_TYPES as $type) {
            $row = $byType[$type] ?? null;
            $items[] = [
                'id' => $row['id'] ?? null,
                'type' => $type,
                'name' => (string) ($row['name'] ?? self::productLabel($type)),
                'quantity' => (int) ($row['stock_qty'] ?? 0),
                'reorderAt' => self::REORDER_AT[$type],
                'unit' => (string) ($row['unit'] ?? $type),
            ];
        }

        return $items;
    }

    private static function productLabel(string $type): string
    {
        $labels = [
            'caps' => 'Sanitary caps',
            'seals' => 'Bottle seals',
            'bottles' => 'Refill bottles',
        ];
        return $labels[$type] ?? ucwords(str_replace(['-', '_'], ' ', $type));
    }

    public static function showInventory(RouteContext $ctx): never
    {
        $items = self::inventoryForStation(self::stationId($ctx->user));
        $map = [];
        foreach ($items as $item) {
            $map[$item['type']] = $item['quantity'];
        }

        Response::json(['inventory' => $items, 'map' => $map]);
    }

    public static function reportInventory(RouteContext $ctx): never
    {
        $stationId = self::stationId($ctx->user);
        $type = trim((string) $ctx->input('item', $ctx->input('itemType', $ctx->input('type', ''))));
        if (!in_array($type, self::INVENTORY_TYPES, true)) {
            Response::fail('Choose a valid inventory item.', 400);
        }

        $amount = (int) $ctx->input('amount', 1);
        $amount = max(-10000, min(10000, $amount));

        $product = Database::one(
            'SELECT * FROM product WHERE station_id = ? AND type = ? LIMIT 1',
            [$stationId, $type]
        );
        if ($product === null) {
            $productId = mb_substr($stationId . ':' . $type, 0, 36);
            Database::run(
                'INSERT INTO product (id, station_id, name, unit, stock_qty, type)
                 VALUES (?, ?, ?, ?, 0, ?)',
                [$productId, $stationId, self::productLabel($type), $type, $type]
            );
            $product = Database::one('SELECT * FROM product WHERE id = ? LIMIT 1', [$productId]);
        }

        $quantity = max(0, (int) $product['stock_qty'] + $amount);
        Database::run('UPDATE product SET stock_qty = ? WHERE id = ?', [$quantity, $product['id']]);

        Response::json([
            'success' => true,
            'item' => [
                'id' => $product['id'],
                'type' => $type,
                'name' => (string) $product['name'],
                'quantity' => $quantity,
                'reorderAt' => self::REORDER_AT[$type],
                'unit' => (string) $product['unit'],
            ],
        ]);
    }

    // -- read-only local prototype sections ---------------------------------

    public static function listMyShifts(RouteContext $ctx): never
    {
        Response::json(['shifts' => []]);
    }

    public static function attendance(RouteContext $ctx): never
    {
        Response::fail('Shift attendance is not stored in the ERD schema.', 404);
    }

    public static function showRequests(RouteContext $ctx): never
    {
        Response::json(['requests' => []]);
    }

    public static function updateRequest(RouteContext $ctx): never
    {
        Response::fail('Customer requests are not stored in the ERD schema.', 404);
    }

    /** @return list<array<string,mixed>> */
    private static function notificationsFor(string $userId): array
    {
        $rows = Database::all(
            'SELECT * FROM notification WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
            [$userId]
        );
        return array_map(static fn (array $row): array => [
            'id' => $row['id'],
            'title' => (string) $row['title'],
            'message' => (string) $row['body'],
            'read' => (bool) $row['read'],
            'createdAt' => Dates::iso($row['created_at']),
        ], $rows);
    }

    public static function showNotifications(RouteContext $ctx): never
    {
        Response::json(['notifications' => self::notificationsFor((string) $ctx->user['id'])]);
    }

    // -- profile -------------------------------------------------------------

    public static function updateProfile(RouteContext $ctx): never
    {
        $result = Auth::updateProfile((string) $ctx->user['id'], [
            'name' => $ctx->input('name', ''),
            'email' => $ctx->input('email', ''),
            'phone' => $ctx->input('phone', ''),
            'location' => $ctx->input('location', ''),
        ]);

        if ($result === null) {
            Response::fail('Staff profile not found.', 404);
        }
        if (isset($result['error'])) {
            Response::fail((string) $result['error'], 400);
        }

        Response::json(['user' => $result]);
    }
}
