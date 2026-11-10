<?php
/**
 * Accounts, password hashing and PHP-managed sessions.
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

    private static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        session_name(AQ_SESSION_COOKIE);
        session_set_cookie_params([
            'lifetime' => AQ_SESSION_TTL,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.gc_maxlifetime', (string) AQ_SESSION_TTL);
        session_start();
    }

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
            Database::run("ALTER TABLE user ADD COLUMN name VARCHAR(100) NOT NULL DEFAULT ''");
            Database::run('UPDATE user SET name = full_name');
        }
        if (!isset($columns['full_name'])) {
            Database::run("ALTER TABLE user ADD COLUMN full_name VARCHAR(100) NOT NULL DEFAULT ''");
            Database::run('UPDATE user SET full_name = name');
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
                Database::run("ALTER TABLE user ADD COLUMN `$column` $definition");
            }
        }

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

        self::startSession();
        $userId = (string) ($_SESSION['user_id'] ?? '');
        if ($userId === '') {
            return self::$currentUser = null;
        }

        $row = Database::one('SELECT * FROM user WHERE id = ? LIMIT 1', [$userId]);

        return self::$currentUser = $row === null ? null : self::publicUser($row);
    }

    public static function login(array $user): void
    {
        self::ensureAuthSchema();
        self::startSession();
        session_regenerate_id(true);
        $_SESSION['user_id'] = (string) $user['id'];

        self::$currentUser = $user;
        self::$resolved    = true;
    }

    public static function logout(): void
    {
        self::ensureAuthSchema();
        self::startSession();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            setcookie(AQ_SESSION_COOKIE, '', [
                'expires' => time() - 3600,
                'path' => '/',
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        }
        session_destroy();

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

        return Database::one('SELECT * FROM user WHERE email = ? LIMIT 1', [$email]);
    }

    public static function findById(string $id): ?array
    {
        self::ensureAuthSchema();
        return Database::one('SELECT * FROM user WHERE id = ? LIMIT 1', [$id]);
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
    public static function createUser(string $email, string $password, string $name, string $role, string $station = '', ?string $phone = null, int $remember = 0): array
    {
        $email    = strtolower(trim($email));
        $name     = trim($name);
        $station  = trim($station);
        $phone    = $phone === null ? null : trim($phone);
        if ($phone === '') {
            $phone = null;
        }

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

        $id = Database::nextReadableId('users');
        $stationId = $role === 'staff'
            ? (string) (Database::scalar('SELECT id FROM station ORDER BY id ASC LIMIT 1') ?? '')
            : '';

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
                'INSERT INTO user (
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
                Database::run(
                    'INSERT INTO customer (id, user_id, default_address, aqua_points) VALUES (?, ?, ?, ?)',
                    [Database::uuid(), $id, '', 0]
                );
            } elseif ($role === 'owner') {
                Database::run(
                    'INSERT INTO station_owner (id, user_id, owner_name) VALUES (?, ?, ?)',
                    [Database::nextReadableId('owners'), $id, $name]
                );
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

        $duplicate = Database::one('SELECT id FROM user WHERE email = ? AND id <> ? LIMIT 1', [$email, $id]);
        if ($duplicate !== null) {
            return ['error' => 'That email address is already in use.'];
        }

        Database::run(
            'UPDATE user SET name = ?, full_name = ?, email = ?, phone = ?, location = ? WHERE id = ?',
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

    /** @return array{success?:bool,error?:string} */
    public static function changePassword(string $id, string $currentPassword, string $newPassword): array
    {
        $user = self::findById($id);
        if ($user === null) {
            return ['error' => 'Account not found.'];
        }
        if (!password_verify($currentPassword, (string) $user['password_hash'])) {
            return ['error' => 'Current password is incorrect.'];
        }
        if (strlen($newPassword) < 8) {
            return ['error' => 'New password must be at least 8 characters.'];
        }

        Database::run(
            'UPDATE user SET password_hash = ? WHERE id = ?',
            [password_hash($newPassword, PASSWORD_DEFAULT), $id]
        );

        return ['success' => true];
    }

    // -- owner staff-approval workflow ---------------------------------------

    /** @return list<array<string,mixed>> */
    public static function listPendingStaff(string $stationId, string $stationName = ''): array
    {
        $stationName = trim($stationName);
        $rows = Database::all(
            "SELECT u.* FROM user u
             LEFT JOIN staff st ON st.user_id = u.id
             WHERE u.role = 'staff' AND u.status = 'pending'
               AND (
                    st.station_id = ?
                    OR u.station_id = ?
                    OR (? <> '' AND LOWER(u.station) = LOWER(?))
               )
             ORDER BY u.created_at ASC",
            [$stationId, $stationId, $stationName, $stationName]
        );

        return array_map([self::class, 'publicUser'], $rows);
    }

    /** @return array<string,mixed>|null */
    public static function decideStaffApproval(
        string $id,
        string $stationId,
        string $stationName,
        string $decision,
        string $approverId = ''
    ): ?array {
        if (!in_array($decision, ['approve', 'reject'], true)) {
            return null;
        }

        $user = self::findById($id);
        $matchesStation = $user !== null && (
            (string) ($user['station_id'] ?? '') === $stationId
            || ($stationName !== '' && strtolower((string) ($user['station'] ?? '')) === strtolower($stationName))
        );

        if (
            $user === null
            || $user['role'] !== 'staff'
            || $user['status'] !== 'pending'
            || !$matchesStation
        ) {
            return null;
        }

        $status = $decision === 'approve' ? 'active' : 'rejected';
        Database::run(
            'UPDATE user SET status = ?, station_id = ?, station = ?, reviewed_at = NOW() WHERE id = ?',
            [$status, $stationId, $stationName !== '' ? $stationName : (string) ($user['station'] ?? ''), $id]
        );

        if ($decision === 'approve') {
            $existing = Database::one('SELECT id FROM staff WHERE user_id = ? LIMIT 1', [$id]);
            if ($existing === null) {
                Database::run(
                    'INSERT INTO staff (id, user_id, station_id, approved_by, status) VALUES (?, ?, ?, ?, ?)',
                    [Database::uuid(), $id, $stationId, $approverId !== '' ? $approverId : null, 'active']
                );
            } else {
                Database::run(
                    'UPDATE staff SET station_id = ?, approved_by = ?, status = ? WHERE id = ?',
                    [$stationId, $approverId !== '' ? $approverId : null, 'active', $existing['id']]
                );
            }
        }

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
