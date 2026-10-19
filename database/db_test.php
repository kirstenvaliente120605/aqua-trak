<?php
/** DB connection test script — confirms PDO link to aquatracker and prints counts */
declare(strict_types=1);
require __DIR__ . '/../php-backend/api/config.php';
try {
    $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4;dbname=%s', AQ_DB_HOST, AQ_DB_PORT, AQ_DB_NAME);
    $pdo = new PDO($dsn, AQ_DB_USER, AQ_DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    echo "DB CONNECTION OK: $dsn\n";
    foreach (['users','station_owners','customers','staff','notifications','stations','rewards','promotions','customer_rewards','products','pricing','subscription_plans','subscriptions','orders','order_items'] as $t) {
        $c = $pdo->query("SELECT COUNT(*) FROM `$t`")?->fetchColumn() ?? 0;
        echo "  $t: $c\n";
    }
} catch (Throwable $e) {
    echo "DB CONNECTION FAILED: " . $e->getMessage() . "\n";
    exit(1);
}
