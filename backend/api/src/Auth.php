<?php
/**
 * Accounts, password hashing and server-side sessions.
 *
 * The user array returned here is the exact shape the frontend already
 * consumes from GET /api/auth/me (camelCase, no password hash), so switching
 * backends does not change anything the browser sees.
 */

declare(strict_types=1);

namespace AquaTracker;

final class Auth
{
    /** Resolved once per request. */
    private static ?array $currentUser = null;
    private static bool $resolved = false;
    private static bool $authSchemaReady = false;

    private static function ensureAuthSchema(): void
    {
        if (self::$authSchemaReady) {
            return;
        }

        $columns = array_fill_keys(
            array_column(Database::all('SHOW COLUMNS FROM user'), 'Field'),
            true
        );
        if (!isset($columns['name']) && !isset($columns['full_name'])) {
            throw new \RuntimeException('The users table must contain a name or full_name column.');
        }

        if (!isset($columns['name'])) {
            Database::run("ALTER TABLE users ADD COLUMN name VARCHAR(100) NOT NULL DEFAULT ''");
            Database::run('UPDATE users SET name = full_name');
        }
        if (!isset($columns['full_name'])) {
            Database::run("ALTER TABLE users ADD COLUMN full_name VARCHAR(100) NOT NULL DEFAULT ''");
            Database::run('UPDATE users SET full_name = name');
        }

        $optionalColumns = [
            'subtitle' => "VARCHAR(190) NOT NULL DEFAULT ''",
            'station' => "VARCHAR(190) NOT NULL DEFAULT ''",
            'station_id' => "VARCHAR(64) NOT NULL DEFAULT ''",
            'permissions' => 'TEXT NULL',
            'location' => "VARCHAR(120) NOT NULL DEFAULT ''",
            'status' => "ENUM('active','pending','rejected') NOT NULL DEFAULT 'active'",
            'reviewed_at' => 'DATETIME NULL',
            'remember_me' => 'TINYINT(1) NOT NULL DEFAULT 0',
        ];
        foreach ($optionalColumns as $column => $definition) {
            if (!isset($columns[$column])) {
                Database::run("ALTER TABLE users ADD COLUMN `$column` $definition");
            }
        }

        Database::run(
            'CREATE TABLE IF NOT EXISTS sessions (
                token CHAR(64) NOT NULL,
                user_id CHAR(36) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (token),
                KEY ix_sessions_user (user_id),
                KEY ix_sessions_expiry (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );

        self::$authSchemaReady = true;
    }

    // -- session lifecycle ---------------------------------------------------

    public static function currentUser(): ?array
    {
        self::ensureAuthSchema();
        if (self::$resolved) {
            return self::$currentUser;
        }
        self::$resolved = true;

        $token = Request::capture()->cookie(AQ_SESSION_COOKIE);
        if ($token === null || $token === '') {
            return self::$currentUser = null;
        }

        // Expired rows are cleared lazily so the table does not grow forever.
        Database::run('DELETE FROM sessions WHERE expires_at <= NOW()');

        $row = Database::one(
            'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token = ? LIMIT 1',
            [$token]
        );

        return self::$currentUser = $row === null ? null : self::publicUser($row);
    }

    public static function login(array $user): void
    {
        self::ensureAuthSchema();
        $token = bin2hex(random_bytes(32));

        Database::run(
            'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
            [$token, $user['id'], AQ_SESSION_TTL]
        );

        // Name matches the cookie js/auth.js logout() expires on the client.
        setcookie(AQ_SESSION_COOKIE, $token, [
            'expires'  => time() + AQ_SESSION_TTL,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        self::$currentUser = $user;
        self::$resolved    = true;
    }

    public static function logout(): void
    {
        self::ensureAuthSchema();
        $token = Request::capture()->cookie(AQ_SESSION_COOKIE);
        if ($token !== null && $token !== '') {
            Database::run('DELETE FROM sessions WHERE token = ?', [$token]);
        }

        setcookie(AQ_SESSION_COOKIE, '', [
            'expires'  => time() - 3600,
            'path'     => '/',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        self::$currentUser = null;
        self::$resolved    = true;
    }

    // -- account lookup ------------------------------------------------------

    public static function findByEmail(string $email): ?array
    {
        self::ensureAuthSchema();
        $email = strtolower(trim($email));
        if ($email === '') {
            return null;
        }

        return Database::one('SELECT * FROM users WHERE email = ? LIMIT 1', [$email]);
    }

    public static function findById(string $id): ?array
    {
        self::ensureAuthSchema();
        return Database::one('SELECT * FROM users WHERE id = ? LIMIT 1', [$id]);
    }

    public static function authenticate(string $email, string $password): ?array
    {
        $user = self::findByEmail($email);

        // Pending staff cannot sign in until an owner approves them, which is
        // why status is checked before the password.
        if ($user === null || ($user['status'] ?? 'active') !== 'active') {
            return null;
        }
        if (!password_verify($password, (string) $user['password_hash'])) {
            return null;
        }

        return $user;
    }

    /**
     * @return array{user?:array<string,mixed>,error?:string}
     */
    public static function createUser(string $email, string $password, string $name, string $role, string $station = '', string $phone = '', int $remember = 0): array
    {
        $email    = strtolower(trim($email));
        $name     = trim($name);
        $station  = trim($station);
        $phone    = trim($phone);

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['error' => 'Please enter a valid email address.'];
        }
        if (strlen($password) < 8) {
            return ['error' => 'Password must be at least 8 characters.'];
        }
        if ($name === '' || strlen($name) > 100 || !in_array($role, AQ_ROLES, true)) {
            return ['error' => 'Please complete all required fields.'];
        }
        if (self::findByEmail($email) !== null) {
            return ['error' => 'An account with that email already exists.'];
        }
        if ($role !== 'customer' && $station === '') {
            return ['error' => 'Station name is required for this role.'];
        }

        $id = Database::uuid();
        $stationId = $role === 'staff' ? 'drink-refill' : '';

        $subtitle = match ($role) {
            'owner' => $station !== '' ? $station : 'Station owner',
            'staff' => 'Station staff',
            default => 'Customer account',
        };

        // Staff accounts are created pending and need an owner to approve them.
        $status = $role === 'staff' ? 'pending' : 'active';
        $permissions = $role === 'staff'
            ? json_encode(['orders', 'inventory', 'requests'], JSON_UNESCAPED_SLASHES)
            : json_encode([], JSON_UNESCAPED_SLASHES);

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            Database::run(
                'INSERT INTO users (
                    id, email, password_hash, name, full_name, role, subtitle,
                    station, station_id, permissions, phone, location, status,
                    remember_me, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
                [
                    $id,
                    $email,
                    password_hash($password, PASSWORD_DEFAULT),
                    $name,
                    $name,
                    $role,
                    $subtitle,
                    $station,
                    $stationId,
                    $permissions,
                    $phone,
                    '',
                    $status,
                    $remember,
                ]
            );
            if ($role === 'customer') {
                Database::run('INSERT INTO customers (user_id, default_address, aqua_points) VALUES (?, ?, ?)', [$id, '', 0]);
            } elseif ($role === 'owner') {
                Database::run('INSERT INTO station_owners (user_id, business_name) VALUES (?, ?)', [$id, $station]);
            }
            $pdo->commit();
        } catch (\PDOException $e) {
            $pdo->rollBack();
            return ['error' => 'Database error: ' . $e->getMessage()];
        }

        return ['user' => self::publicUser((array) self::findById($id))];
    }

    /**
     * @return array{error?:string}|null  null when the id does not exist
     */
    public static function updateProfile(string $id, array $changes): ?array
    {
        if (self::findById($id) === null) {
            return null;
        }

        $name  = trim((string) ($changes['name'] ?? ''));
        $email = strtolower(trim((string) ($changes['email'] ?? '')));

        if ($name === '' || strlen($name) > 100 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['error' => 'Enter a valid name and email address.'];
        }

        $duplicate = Database::one('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1', [$email, $id]);
        if ($duplicate !== null) {
            return ['error' => 'That email address is already in use.'];
        }

        Database::run(
            'UPDATE users SET name = ?, full_name = ?, email = ?, phone = ?, location = ? WHERE id = ?',
            [
                $name,
                $name,
                $email,
                mb_substr(trim((string) ($changes['phone'] ?? '')), 0, 40),
                mb_substr(trim((string) ($changes['location'] ?? '')), 0, 120),
                $id,
            ]
        );

        return self::publicUser((array) self::findById($id));
    }

    // -- owner staff-approval workflow ---------------------------------------

    /** @return list<array<string,mixed>> */
    public static function listPendingStaff(string $station): array
    {
        $rows = Database::all(
            "SELECT * FROM users
             WHERE role = 'staff' AND status = 'pending' AND LOWER(station) = LOWER(?)
             ORDER BY created_at ASC",
            [trim($station)]
        );

        return array_map([self::class, 'publicUser'], $rows);
    }

    /** @return array<string,mixed>|null */
    public static function decideStaffApproval(string $id, string $station, string $decision): ?array
    {
        if (!in_array($decision, ['approve', 'reject'], true)) {
            return null;
        }

        $user = self::findById($id);
        if (
            $user === null
            || $user['role'] !== 'staff'
            || $user['status'] !== 'pending'
            || strtolower((string) $user['station']) !== strtolower(trim($station))
        ) {
            return null;
        }

        Database::run(
            'UPDATE users SET status = ?, reviewed_at = NOW() WHERE id = ?',
            [$decision === 'approve' ? 'active' : 'rejected', $id]
        );

        return self::publicUser((array) self::findById($id));
    }

    // -- middleware ----------------------------------------------------------

    /**
     * API routes answer with 401 JSON; page routes redirect to the login form.
     * Express redirected in both cases, which made unauthenticated fetches
     * follow into an HTML page and fail inside response.json().
     */
    public static function requireAuth(RouteContext $ctx): void
    {
        if (self::currentUser() !== null) {
            $ctx->user = self::$currentUser ?? [];
            return;
        }

        if (str_starts_with($ctx->request->path, '/api/')) {
            Response::fail('Sign in to continue.', 401);
        }

        Response::redirect('/auth/customer/login?error=required');
    }

    public static function requireRole(string $role): callable
    {
        return static function (RouteContext $ctx) use ($role): void {
            self::requireAuth($ctx);

            if (($ctx->user['role'] ?? '') !== $role) {
                Response::fail(ucfirst($role) . ' access required.', 403);
            }
        };
    }

    /** Page guard: sends the visitor to their own dashboard on a role mismatch. */
    public static function requirePageRole(RouteContext $ctx): void
    {
        self::requireAuth($ctx);

        $requested = $ctx->param('role');
        if ($requested === '') {
            return;
        }

        if (($ctx->user['role'] ?? '') !== $requested) {
            Response::redirect(AQ_ROLE_LANDING[$ctx->user['role']] ?? '/customer-dashboard.html');
        }
    }

    // -- shaping -------------------------------------------------------------

    /**
     * Converts a users row into the camelCase, hash-free object the frontend
     * expects. Column names are snake_case in MySQL and camelCase on the wire.
     *
     * @param array<string,mixed> $row
     * @return array<string,mixed>
     */
    public static function publicUser(array $row): array
    {
        $permissions = json_decode((string) ($row['permissions'] ?? '[]'), true);

        return [
            'id'          => $row['id'],
            'email'       => $row['email'],
            'name'        => (string) ($row['name'] ?? $row['full_name'] ?? ''),
            'role'        => $row['role'],
            'subtitle'    => (string) ($row['subtitle'] ?? ''),
            'station'     => (string) ($row['station'] ?? ''),
            'stationId'   => (string) ($row['station_id'] ?? ''),
            'permissions' => is_array($permissions) ? $permissions : [],
            'phone'       => (string) ($row['phone'] ?? ''),
            'location'    => (string) ($row['location'] ?? ''),
            'status'      => (string) ($row['status'] ?? 'active'),
            'createdAt'   => Dates::iso($row['created_at'] ?? null),
        ];
    }

    /**
     * Resets the per-request memo. Only needed by the test harness, which
     * simulates several sessions inside one process.
     */
    public static function reset(): void
    {
        self::$currentUser = null;
        self::$resolved    = false;
    }
}

/**
 * MySQL DATETIME <-> the ISO-ish strings the frontend parses with `new Date()`.
 *
 * Values are stored in the server's local time and emitted without a zone
 * suffix, so JavaScript reads them back as local time too.
 */
final class Dates
{
    public static function iso(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $ts = strtotime((string) $value);
        return $ts === false ? null : date('Y-m-d\TH:i:s', $ts);
    }

    /** MySQL DATETIME literal for right now. */
    public static function now(): string
    {
        return date('Y-m-d H:i:s');
    }

    /** MySQL DATETIME literal offset by whole days. */
    public static function daysFromNow(int $days): string
    {
        return date('Y-m-d H:i:s', strtotime(sprintf('%+d days', $days)));
    }

    public static function today(): string
    {
        return date('Y-m-d');
    }
}