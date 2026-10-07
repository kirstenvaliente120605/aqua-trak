<?php
/**
 * One-shot installer: creates the `aquatracker` database, applies schema.sql
 * and seeds the three demo accounts.
 *
 * Open http://localhost:8080/install to run it.
 *
 * Every statement in schema.sql is CREATE ... IF NOT EXISTS or INSERT IGNORE,
 * so running this more than once is safe and will not wipe existing data.
 */

declare(strict_types=1);

require_once __DIR__ . '/api/config.php';
require_once __DIR__ . '/api/src/Database.php';

use AquaTracker\Database;

$log    = [];
$failed = false;

/**
 * Splits a SQL file into individual statements.
 *
 * Strips `--` line comments first, because a stray semicolon inside a comment
 * would otherwise produce a broken fragment.
 *
 * @return list<string>
 */
function splitStatements(string $sql): array
{
    $lines = [];
    foreach (preg_split('/\R/', $sql) ?: [] as $line) {
        // Keep the leading whitespace/newline handling simple; comments are
        // always full-line in schema.sql.
        $trimmed = ltrim($line);
        if (str_starts_with($trimmed, '--')) {
            continue;
        }
        $lines[] = $line;
    }

    $statements = [];
    foreach (explode(';', implode("\n", $lines)) as $chunk) {
        $chunk = trim($chunk);
        if ($chunk !== '') {
            $statements[] = $chunk;
        }
    }

    return $statements;
}

/**
 * Demo accounts, identical to demoUsers in backend/src/services/authStore.js so
 * the same credentials work on either backend.
 *
 * @return list<array<string,mixed>>
 */
function demoUsers(): array
{
    return [
        [
            'email'       => 'customer.demo@example.com',
            'password'    => 'CustomerDemo123!',
            'name'        => 'Customer Demo',
            'role'        => 'customer',
            'subtitle'    => 'Customer account',
            'station'     => '',
            'station_id'  => '',
            'permissions' => [],
        ],
        [
            'email'       => 'owner.demo@example.com',
            'password'    => 'OwnerDemo123!',
            'name'        => 'Owner Demo',
            'role'        => 'owner',
            'subtitle'    => 'ClearSpring Water Hub',
            'station'     => 'ClearSpring Water Hub',
            'station_id'  => '',
            'permissions' => [],
        ],
        [
            'email'       => 'staff.demo@example.com',
            'password'    => 'StaffDemo123!',
            'name'        => 'Staff Demo',
            'role'        => 'staff',
            'subtitle'    => 'Station staff',
            'station'     => 'ClearSpring Water Hub',
            'station_id'  => 'drink-refill',
            'permissions' => ['orders', 'inventory', 'requests'],
        ],
    ];
}

$installed = 0;

try {
    $server = Database::serverPdo();
    $log[]  = ['ok', 'Connected to MySQL at ' . AQ_DB_HOST . ':' . AQ_DB_PORT . ' as ' . AQ_DB_USER];

    $schemaPath = __DIR__ . '/schema.sql';
    if (!is_file($schemaPath)) {
        throw new RuntimeException('schema.sql is missing from ' . $schemaPath);
    }

    foreach (splitStatements((string) file_get_contents($schemaPath)) as $statement) {
        $server->exec($statement);
        $installed++;
    }
    $log[] = ['ok', 'Applied schema.sql (' . $installed . ' statements)'];

    // Now that the database exists, seed accounts with real password hashes.
    Database::reset();
    $pdo = Database::pdo();

    $seeded = 0;
    foreach (demoUsers() as $user) {
        $exists = Database::scalar('SELECT id FROM users WHERE email = ?', [$user['email']]);
        if ($exists !== null) {
            continue;
        }

        $pdo->prepare(
            'INSERT INTO users (id, email, password_hash, name, role, subtitle, station,
                                station_id, permissions, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            Database::uuid(),
            $user['email'],
            password_hash($user['password'], PASSWORD_DEFAULT),
            $user['name'],
            $user['role'],
            $user['subtitle'],
            $user['station'],
            $user['station_id'],
            json_encode($user['permissions'], JSON_UNESCAPED_SLASHES),
            'active',
        ]);

        $seeded++;
    }

    $log[] = ['ok', $seeded > 0
        ? "Seeded $seeded demo account(s)"
        : 'Demo accounts already present, left untouched'];

    $stations = (int) Database::scalar('SELECT COUNT(*) FROM stations');
    $log[]    = ['ok', "$stations stations in the catalogue"];

} catch (Throwable $e) {
    $failed = true;
    $log[]  = ['bad', $e->getMessage()];
}

http_response_code($failed ? 500 : 200);
header('Content-Type: text/html; charset=utf-8');

$e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AquaTracker setup</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; margin: 0; padding: 48px 24px; background: #f4f7f6; color: #16232e; }
  main { max-width: 680px; margin: 0 auto; background: #fff; padding: 36px; border-radius: 20px; box-shadow: 0 18px 40px rgba(22,35,46,.10); }
  h1 { margin: 0 0 6px; font-size: 26px; }
  p.sub { margin: 0 0 26px; color: #5d7181; }
  ul { list-style: none; padding: 0; margin: 0 0 26px; }
  li { padding: 10px 14px; margin-bottom: 8px; border-radius: 12px; font-size: 14px; }
  li.ok { background: #e6f6f1; color: #10634f; }
  li.bad { background: #fdeceb; color: #b3261e; }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; }
  a.btn { display: inline-block; padding: 12px 20px; border-radius: 999px; background: #16232e; color: #fff; text-decoration: none; font-weight: 600; font-size: 14px; }
  code { background: #eef2f1; padding: 2px 6px; border-radius: 6px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 26px; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e6ecea; }
  th { color: #5d7181; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1><?= $failed ? 'Setup could not finish' : 'Setup complete' ?></h1>
  <p class="sub">AquaTracker database installer</p>

  <ul>
    <?php foreach ($log as [$kind, $message]): ?>
      <li class="<?= $e($kind) ?>"><?= $e($message) ?></li>
    <?php endforeach; ?>
  </ul>

  <?php if ($failed): ?>
    <p>Fix the problem above, then reload this page. The usual cause is the
       password in <code>php-backend/api/config.php</code>.</p>
  <?php else: ?>
    <table>
      <tr><th>Role</th><th>Email</th><th>Password</th></tr>
      <tr><td>Customer</td><td><code>customer.demo@example.com</code></td><td><code>CustomerDemo123!</code></td></tr>
      <tr><td>Owner</td><td><code>owner.demo@example.com</code></td><td><code>OwnerDemo123!</code></td></tr>
      <tr><td>Staff</td><td><code>staff.demo@example.com</code></td><td><code>StaffDemo123!</code></td></tr>
    </table>
  <?php endif; ?>

  <div class="actions">
    <a class="btn" href="/">Go to AquaTracker</a>
    <a class="btn" href="/auth/customer/login">Customer login</a>
  </div>
</main>
</body>
</html>