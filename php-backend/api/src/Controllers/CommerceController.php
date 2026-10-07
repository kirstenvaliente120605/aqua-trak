<?php
/**
 * Customer-facing commerce: the station catalogue, orders and subscriptions.
 *
 * Field names and the pricing rules mirror commerceStore.js so the existing
 * frontend receives byte-compatible payloads.
 */

declare(strict_types=1);

namespace AquaTracker;

final class CommerceController
{
    /** First order number handed out; matches schema.sql's id_sequence seed. */
    private const ORDER_ID_START = 2000;

    /**
     * Atomically reserves the next order number.
     *
     * LAST_INSERT_ID(expr) evaluates the expression on the server and returns it
     * for this connection, so the increment and the read that follows cannot be
     * interleaved with another request's. The UPDATE serialises on the single
     * counter row in id_sequence.
     */
    private static function nextOrderNumber(): int
    {
        $advanced = Database::run(
            'UPDATE id_sequence SET value = LAST_INSERT_ID(value + 1) WHERE name = ?',
            ['orders']
        )->rowCount();

        if ($advanced === 0) {
            // The counter row is missing, which means id_sequence was emptied
            // out from under us. Recreate it rather than quietly handing out an
            // id that is already taken.
            Database::run(
                'INSERT IGNORE INTO id_sequence (name, value) VALUES (?, ?)',
                ['orders', self::ORDER_ID_START]
            );
            Database::run(
                'UPDATE id_sequence SET value = LAST_INSERT_ID(value + 1) WHERE name = ?',
                ['orders']
            );
        }

        return (int) Database::scalar('SELECT LAST_INSERT_ID()');
    }

    // -- stations ------------------------------------------------------------

    public static function stations(RouteContext $ctx): never
    {
        Response::json(['stations' => self::stationCatalog()]);
    }

    /** @return list<array<string,mixed>> */
    public static function stationCatalog(): array
    {
        $rows = Database::all('SELECT * FROM stations ORDER BY name ASC');
        return array_map([self::class, 'shapeStation'], $rows);
    }

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    public static function shapeStation(array $row): array
    {
        return [
            'id'             => $row['id'],
            'name'           => $row['name'],
            'area'           => (string) $row['area'],
            'address'        => (string) $row['address'],
            'phone'          => (string) $row['phone'],
            'hours'          => (string) $row['hours'],
            // Coordinates drive the nearest-station filter in Step 1. alka has
            // none yet, so it stays out of proximity results until they are added.
            'coords'         => $row['lat'] === null || $row['lng'] === null
                ? null
                : ['lat' => (float) $row['lat'], 'lng' => (float) $row['lng']],
            'pricePerGallon' => (float) $row['price_per_gallon'],
            'delivery'       => (bool) $row['delivery'],
            'rating'         => (float) $row['rating'],
        ];
    }

    // -- orders --------------------------------------------------------------

    public static function listOrders(RouteContext $ctx): never
    {
        $rows = Database::all(
            'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC',
            [$ctx->user['id']]
        );

        $catalog = self::stationIndex();
        Response::json(['orders' => array_map(
            static fn (array $r): array => self::shapeOrder($r, $catalog),
            $rows
        )]);
    }

    public static function createOrder(RouteContext $ctx): never
    {
        $pricing = self::calculatePrice(
            (string) $ctx->input('stationId', ''),
            $ctx->input('gallons')
        );

        if ($pricing === null) {
            Response::fail('Choose a station and between 1 and 100 gallons.', 400);
        }

        $fulfillment = $ctx->str('fulfillment') === 'delivery' ? 'delivery' : 'pickup';
        if ($fulfillment === 'delivery' && !$pricing['station']['delivery']) {
            Response::fail('This station does not offer delivery.', 400);
        }

        // Sequential AT-#### ids, starting where the Node store did. The number
        // comes from the id_sequence counter rather than from COUNT(*): COUNT(*)
        // is a read-then-write race, so two overlapping orders would be handed
        // the same id and one of them would fail on a duplicate-key error.
        $id = 'AT-' . str_pad((string) self::nextOrderNumber(), 4, '0', STR_PAD_LEFT);

        Database::run(
            'INSERT INTO orders (id, user_id, customer_name, station_id, station_name, gallons,
                                 fulfillment, status, unit_price, subtotal, discount_rate, discount, total, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $id,
                $ctx->user['id'],
                (string) $ctx->user['name'],
                $pricing['station']['id'],
                $pricing['station']['name'],
                $pricing['gallons'],
                $fulfillment,
                'New order',
                $pricing['unitPrice'],
                $pricing['subtotal'],
                $pricing['discountRate'],
                $pricing['discount'],
                $pricing['total'],
                Dates::now(),
            ]
        );

        $row = (array) Database::one('SELECT * FROM orders WHERE id = ?', [$id]);

        Response::json(['order' => self::shapeOrder($row, self::stationIndex())], 201);
    }

    /**
     * @return array{station:array<string,mixed>,gallons:int,unitPrice:float,
     *               subtotal:float,discountRate:float,discount:float,total:float}|null
     */
    public static function calculatePrice(string $stationId, mixed $gallons): ?array
    {
        $row = Database::one('SELECT * FROM stations WHERE id = ? LIMIT 1', [$stationId]);
        if ($row === null) {
            return null;
        }

        $quantity = filter_var($gallons, FILTER_VALIDATE_INT);
        if ($quantity === false || $quantity < 1 || $quantity > 100) {
            return null;
        }

        $station = self::shapeStation($row);
        $unit    = $station['pricePerGallon'];

        // Volume discount, identical thresholds to calculatePrice() in commerceStore.js.
        $rate      = $quantity >= 8 ? 0.15 : ($quantity >= 5 ? 0.10 : 0.0);
        $subtotal  = $unit * $quantity;
        $discount  = round($subtotal * $rate, 2);

        return [
            'station'      => $station,
            'gallons'      => $quantity,
            'unitPrice'    => $unit,
            'subtotal'     => $subtotal,
            'discountRate' => $rate,
            'discount'     => $discount,
            'total'        => $subtotal - $discount,
        ];
    }

    /**
     * @param array<string,mixed> $row
     * @param array<string,array<string,mixed>> $catalog
     * @return array<string,mixed>
     */
    public static function shapeOrder(array $row, array $catalog = []): array
    {
        $order = [
            'id'           => $row['id'],
            'userId'       => $row['user_id'],
            'customerName' => (string) $row['customer_name'],
            'stationId'    => $row['station_id'],
            'stationName'  => (string) $row['station_name'],
            'gallons'      => (int) $row['gallons'],
            'fulfillment'  => $row['fulfillment'],
            'status'       => (string) $row['status'],
            // The Node store spread its pricing result into the order, which
            // embedded the whole station object. Kept for shape parity.
            'station'      => $catalog[$row['station_id']] ?? null,
            'unitPrice'    => (float) $row['unit_price'],
            'subtotal'     => (float) $row['subtotal'],
            'discountRate' => (float) $row['discount_rate'],
            'discount'     => (float) $row['discount'],
            'total'        => (float) $row['total'],
            'internalNote' => $row['internal_note'] ?? null,
            'createdAt'    => Dates::iso($row['created_at'] ?? null),
            'updatedAt'    => Dates::iso($row['updated_at'] ?? null),
        ];

        return $order;
    }

    /** Station views show "New" rather than the customer-facing "New order". */
    public static function shapeOrderForStation(array $row, array $catalog = []): array
    {
        $order = self::shapeOrder($row, $catalog);
        if ($order['status'] === 'New order') {
            $order['status'] = 'New';
        }
        return $order;
    }

    /** @return array<string,array<string,mixed>> */
    public static function stationIndex(): array
    {
        $index = [];
        foreach (Database::all('SELECT * FROM stations') as $row) {
            $index[$row['id']] = self::shapeStation($row);
        }
        return $index;
    }

    /** @return list<array<string,mixed>> */
    public static function ordersForStation(string $stationId): array
    {
        $rows = Database::all(
            'SELECT * FROM orders WHERE station_id = ? ORDER BY created_at DESC, id DESC',
            [$stationId]
        );

        $catalog = self::stationIndex();
        return array_map(
            static fn (array $r): array => self::shapeOrderForStation($r, $catalog),
            $rows
        );
    }

    // -- subscriptions -------------------------------------------------------

    public static function listSubscriptions(RouteContext $ctx): never
    {
        $rows = Database::all(
            'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC, id DESC',
            [$ctx->user['id']]
        );

        Response::json(['subscriptions' => array_map(
            [self::class, 'shapeSubscription'],
            $rows
        )]);
    }

    public static function createSubscription(RouteContext $ctx): never
    {
        $pricing = self::calculatePrice(
            (string) $ctx->input('stationId', ''),
            $ctx->input('gallons')
        );

        if ($pricing === null) {
            Response::fail('Choose a station and between 1 and 100 gallons.', 400);
        }

        $frequency = in_array($ctx->str('frequency'), ['weekly', 'biweekly', 'monthly'], true)
            ? $ctx->str('frequency')
            : 'monthly';

        // Subscriptions always carry at least the 10% tier discount.
        $rate     = max($pricing['discountRate'], 0.10);
        $id       = 'SUB-' . strtoupper(substr(Database::uuid(), 0, 8));

        Database::run(
            'INSERT INTO subscriptions (id, user_id, customer_name, station_id, station_name, gallons,
                                        frequency, unit_price, discount_rate, estimated_total, status,
                                        next_refill, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $id,
                $ctx->user['id'],
                (string) $ctx->user['name'],
                $pricing['station']['id'],
                $pricing['station']['name'],
                $pricing['gallons'],
                $frequency,
                $pricing['unitPrice'],
                $rate,
                round($pricing['total'] * (1 - $rate), 2),
                'Active',
                Dates::daysFromNow(30),
                Dates::now(),
            ]
        );

        $row = (array) Database::one('SELECT * FROM subscriptions WHERE id = ?', [$id]);
        Response::json(['subscription' => self::shapeSubscription($row)], 201);
    }

    public static function cancelSubscription(RouteContext $ctx): never
    {
        $id  = $ctx->param('id');
        $row = Database::one(
            'SELECT * FROM subscriptions WHERE id = ? AND user_id = ? LIMIT 1',
            [$id, $ctx->user['id']]
        );

        if ($row === null) {
            Response::fail('Subscription not found.', 404);
        }

        Database::run(
            "UPDATE subscriptions SET status = 'Cancelled', cancelled_at = ? WHERE id = ?",
            [Dates::now(), $id]
        );

        $row = (array) Database::one('SELECT * FROM subscriptions WHERE id = ?', [$id]);
        Response::json(['subscription' => self::shapeSubscription($row)]);
    }

    /**
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    public static function shapeSubscription(array $row): array
    {
        return [
            'id'             => $row['id'],
            'userId'         => $row['user_id'],
            'customerName'   => (string) $row['customer_name'],
            'stationId'      => $row['station_id'],
            'stationName'    => (string) $row['station_name'],
            'gallons'        => (int) $row['gallons'],
            'frequency'      => $row['frequency'],
            'unitPrice'      => (float) $row['unit_price'],
            'discountRate'   => (float) $row['discount_rate'],
            'estimatedTotal' => (float) $row['estimated_total'],
            'status'         => (string) $row['status'],
            'nextRefill'     => Dates::iso($row['next_refill'] ?? null),
            'cancelledAt'    => Dates::iso($row['cancelled_at'] ?? null),
            'createdAt'      => Dates::iso($row['created_at'] ?? null),
        ];
    }
}