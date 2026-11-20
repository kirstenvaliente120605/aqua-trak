<?php
/**
 * Seeds the ERD database with the demo accounts, stations, rewards and
 * subscription plans the frontend expects.
 *
 * Run from the project root:
 *   C:\xampp\php\php.exe backend\seed_erd.php
 *
 * Safe to re-run: every row is upserted by primary key.
 */

declare(strict_types=1);

namespace AquaTracker;

require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/src/Database.php';

$customerRow = 'cus-demo-001';
$staffRow   = 'stf-demo-001';

$users = [
    ['customer.demo@example.com', 'CustomerDemo123!', 'customer', 'Mia Santos'],
    ['owner.demo@example.com', 'OwnerDemo123!', 'owner', 'Joan Dela Cruz'],
    ['staff.demo@example.com', 'StaffDemo123!', 'staff', 'Dani Cruz'],
];

$columns = array_fill_keys(array_column(Database::all('SHOW COLUMNS FROM user'), 'Field'), true);
$hasStatus = isset($columns['status']);

$stations = [
    ["DRINK n' REFILL Purified Water Refilling Station", '45 Sabellano St, San Jose District, Pagadian City', 35, 7.827330, 123.444185, true, 15],
    ['Ultra Pure Water Refilling Station', 'Purok Bakhaw A, Brgy. Kawit, Pagadian City', 30, 7.831200, 123.443700, false, 0],
    ['Waterpol Water Refilling Station', 'Purok Pagang, Brgy. Kawit, Pagadian City', 35, 7.834700, 123.448100, true, 15],
    ['PG Aquamaster Water Refilling Station', 'Purok Makugihon, Brgy. Bulatok, Pagadian City', 30, 7.819800, 123.429700, false, 0],
    ["Aqua'Ter SMN Water Refilling Station", 'Beside DXPR Radio, San Jose District, Pagadian City', 25, 7.819100, 123.441200, true, 15],
    ['PH2O Water Refilling Station', 'Warlito Pulmones St, Santiago District, Pagadian City', 30, 7.836200, 123.426400, false, 0],
    ['Alka Water Refilling Station', 'Zone 11, Alta Tierra Subdivision, Tiguma, Pagadian City', 35, 7.840580, 123.463360, true, 15],
];

$rewards = [
    ['rew-30-off', 'P30 Refill Voucher', 'Discount', 100, 'AQUA30OFF', 'P30 off your next refill order.'],
    ['rew-70-off', 'P70 Refill Voucher (2 Free Slim Refills)', 'Discount', 200, 'AQUA70FREE', 'P70 off any refill order of 2 or more containers.'],
    ['rew-caps', '5x Sanitary Container Caps & Seal Kit', 'Merchandise', 150, 'FREE-CAPS5', 'Sanitary caps and seals for five containers.'],
    ['rew-tumbler', 'AquaTracker 750ml Stainless Insulated Tumbler', 'Merchandise', 500, 'CLAIM-TUMBLER', 'Insulated AquaTracker tumbler.'],
];

$pdo = Database::pdo();
$pdo->beginTransaction();

try {
    $userIds = [];
    foreach ($users as [$email, $password, $role, $name]) {
        $id = Database::scalar('SELECT id FROM user WHERE email = ? LIMIT 1', [$email]);
        if ($id === null) {
            $id = Database::nextReadableId('users');
        }
        $status = $role === 'staff' ? 'active' : 'active';
        if ($hasStatus) {
            Database::run(
                'INSERT INTO user (id, email, password_hash, role, full_name, status)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    email = VALUES(email),
                    password_hash = VALUES(password_hash),
                    role = VALUES(role),
                    full_name = VALUES(full_name),
                    status = VALUES(status)',
                [$id, $email, password_hash($password, PASSWORD_DEFAULT), $role, $name, $status]
            );
        } else {
            Database::run(
                'INSERT INTO user (id, email, password_hash, role, full_name)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    email = VALUES(email),
                    password_hash = VALUES(password_hash),
                    role = VALUES(role),
                    full_name = VALUES(full_name)',
                [$id, $email, password_hash($password, PASSWORD_DEFAULT), $role, $name]
            );
        }
        $userIds[$email] = (string) $id;
    }

    $customerUser = $userIds['customer.demo@example.com'];
    $ownerUser = $userIds['owner.demo@example.com'];
    $staffUser = $userIds['staff.demo@example.com'];
    $ownerName = (string) Database::scalar('SELECT full_name FROM user WHERE id = ?', [$ownerUser]);
    $ownerRow = Database::scalar('SELECT id FROM station_owner WHERE user_id = ? LIMIT 1', [$ownerUser]);
    if ($ownerRow === null) {
        $ownerRow = Database::nextReadableId('owners');
    }

    Database::run(
        'INSERT INTO customer (id, user_id, aqua_points)
         VALUES (?, ?, 240)
         ON DUPLICATE KEY UPDATE aqua_points = VALUES(aqua_points)',
        [$customerRow, $customerUser]
    );

    $ownerNameColumn = Database::stationOwnerNameColumn();
    Database::run(
        "INSERT INTO station_owner (id, user_id, `$ownerNameColumn`)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE `$ownerNameColumn` = VALUES(`$ownerNameColumn`)",
        [$ownerRow, $ownerUser, $ownerName]
    );

    $mainStationId = null;
    foreach ($stations as [$name, $address, $price, $lat, $lng, $delivery, $deliveryFee]) {
        $id = Database::scalar('SELECT id FROM station WHERE name = ? ORDER BY id ASC LIMIT 1', [$name]);
        if ($id === null) {
            $id = Database::nextReadableId('stations');
            Database::run(
                'INSERT INTO station (id, owner_id, name, address, lat, lng, status, delivery, delivery_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$id, $ownerRow, $name, $address, $lat, $lng, 'open', (int) $delivery, $deliveryFee]
            );
        } else {
            Database::run('UPDATE station SET lat = ?, lng = ? WHERE id = ?', [$lat, $lng, $id]);
        }
        $id = (string) $id;
        if ($name === "DRINK n' REFILL Purified Water Refilling Station") {
            $mainStationId = $id;
        }

        $planId = mb_substr('plan:' . $id, 0, 36);
        Database::run(
            'INSERT INTO subscription_plan (id, station_id, name, gallons_included, price, frequency, status)
             VALUES (?, ?, ?, 1, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), status = VALUES(status)',
            [$planId, $id, 'Recurring Refill Plan', $price, 'monthly', 'active']
        );

        $products = [
            ['5-gal-slim', '5-Gallon Slim', 'refill', $price],
            ['5-gal-round', '5-Gallon Round', 'refill', $price + 2],
        ];
        foreach ($products as [$type, $label, $unit, $productPrice]) {
            $productId = mb_substr($id . ':' . $type, 0, 36);
            Database::run(
                'INSERT INTO product (id, station_id, name, unit, stock_qty, type)
                 VALUES (?, ?, ?, ?, 0, ?)
                 ON DUPLICATE KEY UPDATE name = VALUES(name), unit = VALUES(unit)',
                [$productId, $id, $label, $unit, $type]
            );

            $pricing = Database::one(
                'SELECT id FROM pricing WHERE product_id = ? ORDER BY effective_from DESC, id DESC LIMIT 1',
                [$productId]
            );
            if ($pricing === null) {
                Database::run(
                    'INSERT INTO pricing (id, product_id, price) VALUES (?, ?, ?)',
                    [Database::uuid(), $productId, $productPrice]
                );
            }
        }

        $inventory = [
            ['caps', 'Sanitary caps', 'caps', $name === "DRINK n' REFILL Purified Water Refilling Station" ? 86 : 0],
            ['seals', 'Bottle seals', 'seals', $name === "DRINK n' REFILL Purified Water Refilling Station" ? 64 : 0],
            ['bottles', 'Refill bottles', 'bottles', $name === "DRINK n' REFILL Purified Water Refilling Station" ? 42 : 0],
        ];
        foreach ($inventory as [$type, $label, $unit, $quantity]) {
            $productId = mb_substr($id . ':' . $type, 0, 36);
            Database::run(
                'INSERT IGNORE INTO product (id, station_id, name, unit, stock_qty, type)
                 VALUES (?, ?, ?, ?, ?, ?)',
                [$productId, $id, $label, $unit, $quantity, $type]
            );
        }
    }

    Database::run(
        'UPDATE station SET operating_hours = ? WHERE id = ?',
        [json_encode(['hours' => 'Mon-Sat 7:30 AM-5:00 PM']), $mainStationId]
    );

    $promotions = [
        ['promo-free-delivery', 'FREE-DELIVERY', 'delivery', 0],
        ['promo-returning', 'RETURNING-CUSTOMER', 'percentage', 10],
    ];
    foreach ($promotions as [$id, $code, $type, $value]) {
        Database::run(
            'INSERT INTO promotion (id, owner_id, code, type, value, expires_at)
             VALUES (?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 30 DAY))
             ON DUPLICATE KEY UPDATE code = VALUES(code), type = VALUES(type), value = VALUES(value),
                expires_at = VALUES(expires_at)',
            [$id, $ownerRow, $code, $type, $value]
        );
    }

    if (isset($columns['station_id'])) {
        // Station name (014: renamed from `subtitle`) always mirrors the row in
        // STATION that station_id points at. STAFF start unassigned (`''`).
        $stationNameSet = isset($columns['station']) ? ', u.station = s.name' : '';
        Database::run(
            "UPDATE user u JOIN station s ON s.id = ?
                SET u.station_id = s.id$stationNameSet
              WHERE u.id IN (?, ?)",
            [$mainStationId, $ownerUser, $staffUser]
        );
    }

    // Permissions live on the STAFF row (015), where the station and approver are.
    $staffColumns = array_fill_keys(array_column(Database::all('SHOW COLUMNS FROM staff'), 'Field'), true);
    $hasStaffPermissions = isset($staffColumns['permissions']);
    $staffParams = [$staffRow, $staffUser, $mainStationId, $ownerUser, 'active'];
    if ($hasStaffPermissions) {
        $staffParams[] = json_encode(['orders', 'inventory', 'requests'], JSON_UNESCAPED_SLASHES);
    }
    Database::run(
        'INSERT INTO staff (id, user_id, station_id, approved_by, status' . ($hasStaffPermissions ? ', permissions' : '') . ")
         VALUES (?, ?, ?, ?, ?" . ($hasStaffPermissions ? ', ?' : '') . ")
         ON DUPLICATE KEY UPDATE station_id = VALUES(station_id), approved_by = VALUES(approved_by),
            status = VALUES(status)" . ($hasStaffPermissions ? ', permissions = VALUES(permissions)' : ''),
        $staffParams
    );

    foreach ($rewards as [$id, $name, $category, $points, $code, $description]) {
        Database::run(
            'INSERT INTO reward (id, owner_id, name, reward_description, status, code, points_cost, category)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                owner_id = VALUES(owner_id),
                name = VALUES(name),
                reward_description = VALUES(reward_description),
                status = VALUES(status),
                code = VALUES(code),
                points_cost = VALUES(points_cost),
                category = VALUES(category)',
            [$id, null, $name, $description, 'active', $code, $points, $category]
        );
    }

    $pdo->commit();
} catch (\Throwable $e) {
    $pdo->rollBack();
    fwrite(STDERR, 'Seed failed: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}

echo 'Seeded ' . count($users) . ' users, ' . count($stations) . ' stations, '
    . count($rewards) . ' rewards and ' . count($stations) . ' plans.' . PHP_EOL;
