<?php
/**
 * Station staff workspace: order queue, shifts, inventory, customer requests
 * and notifications. Every query is scoped to the signed-in staff member's
 * assigned station, mirroring stationFor() in staffStore.js.
 */

declare(strict_types=1);

namespace AquaTracker;

final class StaffController
{
    /** Staff with no stationId fall back to the demo station, as in Node. */
    private static function stationFor(array $user): string
    {
        $station = trim((string) ($user['stationId'] ?? ''));
        return $station !== '' ? $station : 'drink-refill';
    }

    // -- overview ------------------------------------------------------------

    public static function overview(RouteContext $ctx): never
    {
        $stationId = self::stationFor($ctx->user);

        $orders   = CommerceController::ordersForStation($stationId);
        $shifts   = self::listShifts($stationId, (string) $ctx->user['id']);
        $inventory = self::listInventory($stationId);
        $requests = self::listRequests($stationId);

        $active  = ['New', 'Confirmed', 'Preparing', 'Ready for Pickup', 'Out for Delivery'];
        $pending = array_values(array_filter(
            $orders,
            static fn (array $o): bool => in_array($o['status'], $active, true)
        ));

        $alerts = array_values(array_map(
            static fn (array $i): array => [
                'id'     => $i['id'],
                'label'  => $i['name'] . ' is low',
                'detail' => sprintf('%d %s remaining · reorder at %d', $i['quantity'], $i['unit'], $i['reorderAt']),
            ],
            array_filter($inventory, static fn (array $i): bool => $i['quantity'] <= $i['reorderAt'])
        ));

        $completed = array_slice(array_values(array_filter(
            $orders,
            static fn (array $o): bool => $o['status'] === 'Delivered'
        )), 0, 5);

        $today       = Dates::today();
        $currentFor  = array_values(array_filter(
            $shifts,
            static fn (array $s): bool => $s['date'] === $today
        ));
        $currentShift = $currentFor[0] ?? ($shifts[0] ?? null);

        Response::json([
            'stationId'     => $stationId,
            'stationName'   => (string) ($ctx->user['station'] ?: 'Assigned station'),
            'metrics'       => [
                'assignedOrders' => count($pending),
                'ready'          => count(array_filter($orders, static fn (array $o): bool => $o['status'] === 'Ready for Pickup')),
                'openRequests'   => count(array_filter($requests, static fn (array $r): bool => !in_array($r['status'], ['Resolved', 'Closed'], true))),
                'lowStock'       => count($alerts),
            ],
            'orders'         => array_slice($orders, 0, 5),
            'pendingOrders'  => array_slice($pending, 0, 5),
            'completedTasks' => array_map(
                static fn (array $o): array => [
                    'id'          => $o['id'],
                    'label'       => sprintf('Order %s delivered', $o['id']),
                    'detail'      => sprintf('%s · %d gallons', $o['customerName'], $o['gallons']),
                    'completedAt' => $o['updatedAt'] ?? $o['createdAt'],
                ],
                $completed
            ),
            'inventoryAlerts' => $alerts,
            'currentShift'    => $currentShift,
            'nextShift'       => $shifts[0] ?? null,
            'notifications'   => self::listNotifications($stationId),
        ]);
    }

    // -- orders --------------------------------------------------------------

    public static function listOrders(RouteContext $ctx): never
    {
        $stationId = self::stationFor($ctx->user);
        $orders    = CommerceController::ordersForStation($stationId);

        $status = trim((string) $ctx->input('status', ''));
        $search = strtolower(trim((string) $ctx->input('search', '')));

        if ($status !== '' && $status !== 'all') {
            $orders = array_values(array_filter(
                $orders,
                static fn (array $o): bool => $o['status'] === $status
            ));
        }

        if ($search !== '') {
            $orders = array_values(array_filter($orders, static function (array $o) use ($search): bool {
                $haystack = strtolower(implode(' ', [
                    (string) $o['id'],
                    (string) $o['customerName'],
                    (string) $o['stationName'],
                ]));
                return str_contains($haystack, $search);
            }));
        }

        Response::json([
            'stationId' => $stationId,
            'statuses'  => AQ_ORDER_STATUSES,
            'orders'    => $orders,
        ]);
    }

    public static function showOrder(RouteContext $ctx): never
    {
        $order = self::findOrder($ctx);
        Response::json(['order' => $order]);
    }

    public static function updateOrder(RouteContext $ctx): never
    {
        $stationId = self::stationFor($ctx->user);
        $order     = self::findOrder($ctx);

        $status = trim((string) $ctx->input('status', ''));
        $note   = $ctx->input('internalNote');

        if ($status !== '' && !in_array($status, AQ_ORDER_STATUSES, true)) {
            Response::fail('Order is not assigned to your station or the update is invalid.', 400);
        }

        $fields = [];
        $values = [];

        if ($status !== '') {
            $fields[] = 'status = ?';
            $values[] = $status;
        }
        if (is_string($note)) {
            $fields[] = 'internal_note = ?';
            $values[] = mb_substr(trim($note), 0, 1000);
        }

        if ($fields !== []) {
            $fields[] = 'updated_at = ?';
            $values[] = Dates::now();
            $values[] = $order['id'];
            $values[] = $stationId;

            Database::run(
                'UPDATE orders SET ' . implode(', ', $fields) . ' WHERE id = ? AND station_id = ?',
                $values
            );
        }

        $row = (array) Database::one(
            'SELECT * FROM orders WHERE id = ? AND station_id = ? LIMIT 1',
            [$order['id'], $stationId]
        );

        Response::json(['order' => CommerceController::shapeOrderForStation(
            $row,
            CommerceController::stationIndex()
        )]);
    }

    /** @return array<string,mixed> */
    private static function findOrder(RouteContext $ctx): array
    {
        $row = Database::one(
            'SELECT * FROM orders WHERE id = ? AND station_id = ? LIMIT 1',
            [$ctx->param('id'), self::stationFor($ctx->user)]
        );

        if ($row === null) {
            Response::fail('Order not found for your assigned station.', 404);
        }

        return CommerceController::shapeOrderForStation($row, CommerceController::stationIndex());
    }

    // -- shifts --------------------------------------------------------------

    /** @return list<array<string,mixed>> */
    public static function listShifts(string $stationId, string $staffId): array
    {
        self::seedShiftsIfEmpty($stationId, $staffId);

        $rows = Database::all(
            'SELECT * FROM staff_shifts WHERE staff_id = ? AND station_id = ? ORDER BY date ASC, start ASC',
            [$staffId, $stationId]
        );

        return array_map([self::class, 'shapeShift'], $rows);
    }

    /**
     * Gives a brand new staff account a starting rota so the shift workspace is
     * not empty on first login, matching seedShifts() in staffStore.js.
     */
    private static function seedShiftsIfEmpty(string $stationId, string $staffId): void
    {
        $exists = Database::scalar(
            'SELECT COUNT(*) FROM staff_shifts WHERE staff_id = ?',
            [$staffId]
        );

        if ((int) $exists > 0) {
            return;
        }

        Database::run(
            'INSERT INTO staff_shifts (id, staff_id, station_id, date, start, end, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [Database::uuid(), $staffId, $stationId, Dates::today(), '14:00', '21:00', 'Scheduled']
        );
        Database::run(
            'INSERT INTO staff_shifts (id, staff_id, station_id, date, start, end, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [Database::uuid(), $staffId, $stationId, date('Y-m-d', strtotime('+1 day')), '08:00', '16:00', 'Scheduled']
        );
    }

    public static function listMyShifts(RouteContext $ctx): never
    {
        Response::json(['shifts' => self::listShifts(
            self::stationFor($ctx->user),
            (string) $ctx->user['id']
        )]);
    }

    public static function attendance(RouteContext $ctx): never
    {
        $action = trim((string) $ctx->input('action', ''));
        if (!in_array($action, ['check-in', 'check-out'], true)) {
            Response::fail('Attendance action is not available for this shift.', 400);
        }

        $stationId = self::stationFor($ctx->user);
        $row       = Database::one(
            'SELECT * FROM staff_shifts WHERE id = ? AND staff_id = ? AND station_id = ? LIMIT 1',
            [$ctx->param('id'), (string) $ctx->user['id'], $stationId]
        );

        if ($row === null) {
            Response::fail('Attendance action is not available for this shift.', 400);
        }

        $attendance = json_decode((string) ($row['attendance'] ?? '{}'), true);
        if (!is_array($attendance)) {
            $attendance = [];
        }
        $attendance[$action] = Dates::iso(Dates::now());

        Database::run(
            'UPDATE staff_shifts SET attendance = ?, status = ? WHERE id = ?',
            [
                json_encode($attendance, JSON_UNESCAPED_SLASHES),
                $action === 'check-in' ? 'In progress' : 'Completed',
                $row['id'],
            ]
        );

        $row = (array) Database::one('SELECT * FROM staff_shifts WHERE id = ?', [$row['id']]);
        Response::json(['shift' => self::shapeShift($row)]);
    }

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    private static function shapeShift(array $row): array
    {
        $attendance = json_decode((string) ($row['attendance'] ?? 'null'), true);

        return [
            'id'         => $row['id'],
            'staffId'    => $row['staff_id'],
            'stationId'  => $row['station_id'],
            'date'       => Dates::iso($row['date'] ?? null),
            'start'      => (string) $row['start'],
            'end'        => (string) $row['end'],
            'status'     => (string) $row['status'],
            'attendance' => is_array($attendance) ? $attendance : null,
        ];
    }

    // -- inventory -----------------------------------------------------------

    /** @return list<array<string,mixed>> */
    public static function listInventory(string $stationId): array
    {
        $rows = Database::all(
            'SELECT * FROM inventory_items WHERE station_id = "" OR station_id = ? ORDER BY name ASC',
            [$stationId]
        );

        return array_map(static fn (array $r): array => [
            'id'        => $r['id'],
            'name'      => $r['name'],
            'quantity'  => (int) $r['quantity'],
            'reorderAt' => (int) $r['reorder_at'],
            'unit'      => (string) $r['unit'],
        ], $rows);
    }

    public static function showInventory(RouteContext $ctx): never
    {
        Response::json(['inventory' => self::listInventory(self::stationFor($ctx->user))]);
    }

    public static function reportInventory(RouteContext $ctx): never
    {
        $stationId = self::stationFor($ctx->user);
        $itemId    = (string) $ctx->input('itemId', '');
        $type      = (string) $ctx->input('type', 'missing');
        $type      = in_array($type, ['return', 'damage', 'missing'], true) ? $type : 'missing';

        $amount = (int) $ctx->input('amount', 1);
        $amount = max(1, min(1000, $amount));

        $item = Database::one(
            'SELECT * FROM inventory_items WHERE id = ? AND (station_id = "" OR station_id = ?) LIMIT 1',
            [$itemId, $stationId]
        );

        if ($item === null) {
            Response::fail('Inventory item not found for your assigned station.', 400);
        }

        Database::run(
            'INSERT INTO inventory_reports (id, item_id, staff_id, type, amount, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                Database::uuid(),
                $itemId,
                (string) $ctx->user['id'],
                $type,
                $amount,
                mb_substr(trim((string) $ctx->input('note', '')), 0, 500),
                Dates::now(),
            ]
        );

        // Returns add stock back; damage and missing subtract it.
        $delta = match ($type) {
            'return' => $amount,
            default  => -$amount,
        };

        Database::run(
            'UPDATE inventory_items SET quantity = GREATEST(0, quantity + ?) WHERE id = ?',
            [$delta, $itemId]
        );

        $fresh = (array) Database::one('SELECT * FROM inventory_items WHERE id = ?', [$itemId]);

        Response::json(['item' => [
            'id'        => $fresh['id'],
            'name'      => $fresh['name'],
            'quantity'  => (int) $fresh['quantity'],
            'reorderAt' => (int) $fresh['reorder_at'],
            'unit'      => (string) $fresh['unit'],
        ]], 201);
    }

    // -- requests ------------------------------------------------------------

    /** @return list<array<string,mixed>> */
    public static function listRequests(string $stationId): array
    {
        $rows = Database::all(
            'SELECT * FROM customer_requests WHERE station_id = ? ORDER BY created_at DESC',
            [$stationId]
        );

        return array_map(static fn (array $r): array => [
            'id'           => $r['id'],
            'stationId'    => $r['station_id'],
            'customerName' => (string) $r['customer_name'],
            'subject'      => (string) $r['subject'],
            'message'      => (string) $r['message'],
            'status'       => (string) $r['status'],
            'createdAt'    => Dates::iso($r['created_at'] ?? null),
            'updatedAt'    => Dates::iso($r['updated_at'] ?? null),
        ], $rows);
    }

    public static function showRequests(RouteContext $ctx): never
    {
        Response::json(['requests' => self::listRequests(self::stationFor($ctx->user))]);
    }

    public static function updateRequest(RouteContext $ctx): never
    {
        $stationId = self::stationFor($ctx->user);
        $status    = trim((string) $ctx->input('status', ''));

        $row = Database::one(
            'SELECT * FROM customer_requests WHERE id = ? AND station_id = ? LIMIT 1',
            [$ctx->param('id'), $stationId]
        );

        if ($row === null || !in_array($status, ['Open', 'In progress', 'Resolved', 'Closed'], true)) {
            Response::fail('Request update is invalid.', 400);
        }

        Database::run(
            'UPDATE customer_requests SET status = ?, updated_at = ? WHERE id = ?',
            [$status, Dates::now(), $row['id']]
        );

        $fresh = (array) Database::one('SELECT * FROM customer_requests WHERE id = ?', [$row['id']]);

        Response::json(['request' => [
            'id'           => $fresh['id'],
            'stationId'    => $fresh['station_id'],
            'customerName' => (string) $fresh['customer_name'],
            'subject'      => (string) $fresh['subject'],
            'message'      => (string) $fresh['message'],
            'status'       => (string) $fresh['status'],
            'createdAt'    => Dates::iso($fresh['created_at'] ?? null),
            'updatedAt'    => Dates::iso($fresh['updated_at'] ?? null),
        ]]);
    }

    // -- notifications -------------------------------------------------------

    /** @return list<array<string,mixed>> */
    public static function listNotifications(string $stationId): array
    {
        $rows = Database::all(
            'SELECT * FROM notifications WHERE station_id = ? ORDER BY created_at DESC',
            [$stationId]
        );

        return array_map(static fn (array $r): array => [
            'id'        => $r['id'],
            'stationId' => $r['station_id'],
            'title'     => (string) $r['title'],
            'message'   => (string) $r['message'],
            'read'      => (bool) $r['is_read'],
            'createdAt' => Dates::iso($r['created_at'] ?? null),
        ], $rows);
    }

    public static function showNotifications(RouteContext $ctx): never
    {
        Response::json(['notifications' => self::listNotifications(self::stationFor($ctx->user))]);
    }

    // -- profile -------------------------------------------------------------

    public static function updateProfile(RouteContext $ctx): never
    {
        $result = Auth::updateProfile((string) $ctx->user['id'], [
            'name'     => $ctx->input('name', ''),
            'email'    => $ctx->input('email', ''),
            'phone'    => $ctx->input('phone', ''),
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