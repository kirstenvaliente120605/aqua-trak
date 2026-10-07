<?php
/**
 * Station owner workspace: overview metrics, pricing, settings and the customer
 * list derived from order history. Mirrors ownerStore.js.
 */

declare(strict_types=1);

namespace AquaTracker;

final class OwnerController
{
    private const FALLBACK_STATION = 'drink-refill';

    private static function stationFor(array $user): string
    {
        $station = trim((string) ($user['stationId'] ?? ''));
        return $station !== '' ? $station : self::FALLBACK_STATION;
    }

    public static function overview(RouteContext $ctx): never
    {
        $stationId = self::stationFor($ctx->user);
        $orders    = CommerceController::ordersForStation($stationId);

        $revenue = array_sum(array_map(static fn (array $o): float => (float) $o['total'], $orders));
        $today   = Dates::today();

        $ordersToday = count(array_filter(
            $orders,
            static fn (array $o): bool => str_starts_with((string) $o['createdAt'], $today)
        ));

        $customers = [];
        foreach ($orders as $order) {
            $customers[(string) $order['userId']] = true;
        }

        Response::json([
            'revenue'       => round($revenue, 2),
            'orderVolume'   => count($orders),
            'ordersToday'   => $ordersToday,
            'customerCount' => count($customers),
        ]);
    }

    public static function listOrders(RouteContext $ctx): never
    {
        Response::json(['orders' => CommerceController::ordersForStation(self::stationFor($ctx->user))]);
    }

    // -- customers -----------------------------------------------------------

    public static function listCustomers(RouteContext $ctx): never
    {
        $orders = CommerceController::ordersForStation(self::stationFor($ctx->user));

        /** @var array<string,array<string,mixed>> $map */
        $map = [];
        foreach ($orders as $order) {
            $id = (string) $order['userId'];

            if (!isset($map[$id])) {
                $map[$id] = [
                    'id'         => $id,
                    'name'       => $order['customerName'],
                    'totalSpent' => 0.0,
                    'orderCount' => 0,
                    'lastOrder'  => $order['createdAt'],
                ];
            }

            $map[$id]['totalSpent'] += (float) $order['total'];
            $map[$id]['orderCount']++;

            // Orders are newest-first, but compare explicitly so the result does
            // not depend on row ordering.
            if (strtotime((string) $order['createdAt']) > strtotime((string) $map[$id]['lastOrder'])) {
                $map[$id]['lastOrder'] = $order['createdAt'];
            }
        }

        foreach ($map as $entry) {
            $entry['totalSpent'] = round($entry['totalSpent'], 2);
        }

        Response::json(['customers' => array_values($map)]);
    }

    // -- pricing -------------------------------------------------------------

    public static function getPricing(RouteContext $ctx): never
    {
        Response::json(['pricing' => self::readBlob('station_pricing', self::stationFor($ctx->user), [])]);
    }

    public static function updatePricing(RouteContext $ctx): never
    {
        $pricing = $ctx->input('pricing');
        if (!is_array($pricing)) {
            Response::fail('Pricing must be an object of container prices.', 400);
        }

        self::writeBlob('station_pricing', self::stationFor($ctx->user), $pricing);

        Response::json(['success' => true]);
    }

    // -- settings ------------------------------------------------------------

    public static function getSettings(RouteContext $ctx): never
    {
        $defaults = [
            'name'    => 'Unknown Station',
            'address' => 'Unknown Address',
            'hours'   => 'Not set',
            'contact' => 'Not set',
        ];

        Response::json(['settings' => self::readBlob(
            'station_settings',
            self::stationFor($ctx->user),
            $defaults
        )]);
    }

    public static function updateSettings(RouteContext $ctx): never
    {
        $settings = $ctx->input('settings');
        if (!is_array($settings)) {
            Response::fail('Settings must be an object.', 400);
        }

        $stationId = self::stationFor($ctx->user);
        $current   = self::readBlob('station_settings', $stationId, []);
        self::writeBlob('station_settings', $stationId, array_merge($current, $settings));

        Response::json(['success' => true]);
    }

    // -- JSON blob storage ---------------------------------------------------

    /**
     * Per-station JSON documents live in a small key/value table rather than one
     * table per concern, which keeps pricing and settings schemaless the same
     * way the Node version used free-form JSON files.
     */
    private static function readBlob(string $table, string $stationId, array $default): array
    {
        $row = Database::one("SELECT payload FROM `$table` WHERE station_id = ? LIMIT 1", [$stationId]);
        if ($row === null) {
            return $default;
        }

        $decoded = json_decode((string) $row['payload'], true);
        return is_array($decoded) ? $decoded : $default;
    }

    private static function writeBlob(string $table, string $stationId, array $payload): void
    {
        Database::run(
            "INSERT INTO `$table` (station_id, payload) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE payload = VALUES(payload)",
            [$stationId, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)]
        );
    }
}