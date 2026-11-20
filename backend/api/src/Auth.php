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

    /** Permissions every station staff member starts with (015: stored on STAFF). */
    private const STAFF_PERMISSIONS = ['orders', 'inventory', 'requests'];

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
        if (!isset($columns['full_name'])) {
            throw new \RuntimeException('The user table must contain a full_name column.');
        }

        // Migration 014 renamed `subtitle` to `station`. Rename in place on a
        // database that still carries the old name so the stored labels are
        // kept instead of being replaced by an empty new column.
        if (!isset($columns['station']) && isset($columns['subtitle'])) {
            Database::run("ALTER TABLE user CHANGE COLUMN `subtitle` `station` VARCHAR(190) NOT NULL DEFAULT ''");
            $columns['station'] = true;
            unset($columns['subtitle']);
        }

        $optionalColumns = [
            'station' => "VARCHAR(190) NOT NULL DEFAULT ''",
            'station_id' => "VARCHAR(64) NOT NULL DEFAULT ''",
            'status' => "ENUM('active','pending','rejected') NOT NULL DEFAULT 'active'",
            'email_verified' => 'TINYINT(1) NOT NULL DEFAULT 1',
            'auth_version' => 'INT UNSIGNED NOT NULL DEFAULT 1',
        ];
        foreach ($optionalColumns as $column => $definition) {
            if (!isset($columns[$column])) {
                Database::run("ALTER TABLE user ADD COLUMN `$column` $definition");
            }
        }

        // Migration 015 moved permissions onto the STAFF row, which already
        // carries the station and the approving owner.
        $hasStaffTable = (int) Database::scalar(
            "SELECT COUNT(*) FROM information_schema.tables
              WHERE table_schema = DATABASE() AND table_name = 'staff'"
        ) > 0;
        if ($hasStaffTable) {
            $staffColumns = array_fill_keys(
                array_column(Database::all('SHOW COLUMNS FROM staff'), 'Field'),
                true
            );
            if (!isset($staffColumns['permissions'])) {
                Database::run('ALTER TABLE staff ADD COLUMN `permissions` TEXT NULL');
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

        $row = Database::one(
            'SELECT id, email, password_hash, full_name, role, station, station_id,
                    (SELECT s.name FROM station s WHERE s.id = user.station_id) AS station_name,
                    (SELECT sp.permissions FROM staff sp WHERE sp.user_id = user.id LIMIT 1) AS staff_permissions,
                    status, email_verified, auth_version, created_at
             FROM user WHERE id = ? LIMIT 1',
            [$userId]
        );

        if (
            $row === null
            || (int) ($row['email_verified'] ?? 1) !== 1
            || (int) ($row['auth_version'] ?? 1) !== (int) ($_SESSION['auth_version'] ?? 0)
        ) {
            $_SESSION = [];
            session_destroy();
            return self::$currentUser = null;
        }

        return self::$currentUser = self::publicUser($row);
    }

    public static function login(array $user): void
    {
        self::ensureAuthSchema();
        self::startSession();
        $account = self::findById((string) $user['id']);
        if ($account === null || (int) ($account['email_verified'] ?? 1) !== 1) {
            throw new \RuntimeException('A verified account is required to start a session.');
        }
        session_regenerate_id(true);
        $_SESSION['user_id'] = (string) $account['id'];
        $_SESSION['auth_version'] = (int) ($account['auth_version'] ?? 1);

        self::$currentUser = self::publicUser($account);
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

        return Database::one(
            'SELECT id, email, password_hash, full_name, role, station, station_id,
                    (SELECT s.name FROM station s WHERE s.id = user.station_id) AS station_name,
                    (SELECT sp.permissions FROM staff sp WHERE sp.user_id = user.id LIMIT 1) AS staff_permissions,
                    status, email_verified, auth_version, created_at
             FROM user WHERE email = ? LIMIT 1',
            [$email]
        );
    }

    public static function findById(string $id): ?array
    {
        self::ensureAuthSchema();
        return Database::one(
            'SELECT id, email, password_hash, full_name, role, station, station_id,
                    (SELECT s.name FROM station s WHERE s.id = user.station_id) AS station_name,
                    (SELECT sp.permissions FROM staff sp WHERE sp.user_id = user.id LIMIT 1) AS staff_permissions,
                    status, email_verified, auth_version, created_at
             FROM user WHERE id = ? LIMIT 1',
            [$id]
        );
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
    public static function createUser(string $email, string $password, string $name, string $role, string $station = ''): array
    {
        $email    = strtolower(trim($email));
        $name     = trim($name);
        $station  = $role === 'owner' ? trim($station) : '';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['error' => 'Please enter a valid email address.'];
        }
        if (strlen($password) < 8 || strlen($password) > 128) {
            return ['error' => 'Password must be between 8 and 128 characters.'];
        }
        if ($name === '' || strlen($name) > 100 || !in_array($role, AQ_ROLES, true)) {
            return ['error' => 'Please complete all required fields.'];
        }
        if (self::findByEmail($email) !== null) {
            return ['error' => 'An account with that email already exists.'];
        }
        // user.station_id is `varchar(64) NOT NULL DEFAULT ''`, so NULL is not
        // available and '' is the single "unassigned" marker shared by signup,
        // the seeders and the approval claim. Staff start unassigned and are
        // attached to a station by the owner who approves them.
        $stationId = '';
        if ($role === 'owner' && $station === '') {
            return ['error' => 'Station name is required for this role.'];
        }
        $id = Database::nextReadableId('users');

        $stationLabel = match ($role) {
            'owner' => $station,
            'staff' => '',
            default => 'Customer account',
        };

        // Staff accounts are created pending and need an owner to approve them.
        // Their permissions are written to the STAFF row at approval time (015),
        // never to the login account.
        $status = $role === 'staff' ? 'pending' : 'active';
        $ownerNameColumn = $role === 'owner'
            ? Database::stationOwnerNameColumn()
            : '';

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            Database::run(
                'INSERT INTO user (
                    id, email, password_hash, full_name, role, station,
                    station_id, status,
                    email_verified, auth_version, created_at
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NOW())',
                [
                    $id,
                    $email,
                    password_hash($password, PASSWORD_DEFAULT),
                    $name,
                    $role,
                    $stationLabel,
                    $stationId,
                    $status,
                ]
            );
            if ($role === 'customer') {
                Database::run(
                    'INSERT INTO customer (id, user_id, aqua_points) VALUES (?, ?, ?)',
                    [Database::uuid(), $id, 0]
                );
            } elseif ($role === 'owner') {
                $ownerRowId = Database::nextReadableId('owners');
                Database::run(
                    "INSERT INTO station_owner (id, user_id, `$ownerNameColumn`) VALUES (?, ?, ?)",
                    [$ownerRowId, $id, $name]
                );
                // Attach the owner to their own station when one already carries
                // the name they signed up with. The join is scoped to the row
                // just created, so a same-named station of another owner can
                // never be picked up.
                Database::run(
                    'UPDATE user u JOIN station s ON s.owner_id = ? AND s.name = u.station
                        SET u.station_id = s.id
                      WHERE u.id = ?',
                    [$ownerRowId, $id]
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
        $existing = self::findById($id);
        if ($existing === null) {
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
            'UPDATE user SET full_name = ?, email = ?, email_verified = ?,
                    auth_version = auth_version + ? WHERE id = ?',
            [
                $name,
                $email,
                strtolower((string) $existing['email']) === $email ? 1 : 0,
                strtolower((string) $existing['email']) === $email ? 0 : 1,
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

    public static function markEmailVerified(string $id): ?array
    {
        Database::run('UPDATE user SET email_verified = 1 WHERE id = ?', [$id]);
        $user = self::findById($id);
        return $user === null ? null : self::publicUser($user);
    }

    public static function resetPassword(string $id, string $password): void
    {
        Database::run(
            'UPDATE user SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?',
            [password_hash($password, PASSWORD_DEFAULT), $id]
        );
    }

    // -- owner staff-approval workflow ---------------------------------------

    /**
     * Unclaimed staff applications, returned to every owner. Applicants are a
     * shared queue: the first owner to approve one claims it for a station of
     * their own in decideStaffApproval().
     *
     * @return list<array<string,mixed>>
     */
    public static function listPendingStaff(): array
    {
        $rows = Database::all(
            "SELECT u.*,
                    (SELECT s.name FROM station s WHERE s.id = u.station_id) AS station_name,
                    (SELECT sp.permissions FROM staff sp WHERE sp.user_id = u.id LIMIT 1) AS staff_permissions
             FROM user u
             WHERE u.role = 'staff' AND u.status = 'pending'
             ORDER BY u.created_at ASC"
        );

        return array_map([self::class, 'publicUser'], $rows);
    }

    /**
     * Approve or reject a pending staff application.
     *
     * Approving requires $stationId (one of the approver's own stations) and
     * claims the applicant atomically: only an unassigned, still-pending row is
     * updated, so a second owner racing for the same applicant gets a conflict
     * instead of overwriting the first claim.
     *
     * @return array{approval?:array<string,mixed>,error?:string,status?:int}|null
     *         null when the id is not a pending staff account
     */
    public static function decideStaffApproval(
        string $id,
        string $stationId,
        string $decision,
        string $approverId = ''
    ): ?array {
        if (!in_array($decision, ['approve', 'reject'], true)) {
            return null;
        }

        $user = self::findById($id);
        if ($user === null || ($user['role'] ?? '') !== 'staff') {
            return null;
        }

        // Already decided by an owner (approved or rejected): the second owner
        // gets a conflict, not a "not found", and the applicant is left alone.
        if (($user['status'] ?? '') !== 'pending') {
            return ['error' => 'This application was already decided by another owner.', 'status' => 409];
        }

        if ($decision === 'reject') {
            $rejected = Database::run(
                "UPDATE user SET status = 'rejected'
                  WHERE id = ? AND role = 'staff' AND status = 'pending'",
                [$id]
            );
            if ($rejected->rowCount() !== 1) {
                return ['error' => 'This application was already decided by another owner.', 'status' => 409];
            }

            return ['approval' => self::publicUser((array) self::findById($id))];
        }

        if ($stationId === '') {
            return ['error' => 'Choose one of your stations to assign this staff member.', 'status' => 400];
        }

        $pdo = Database::pdo();
        $pdo->beginTransaction();
        try {
            $claim = $pdo->prepare(
                "UPDATE user
                    SET status = 'active',
                        station_id = ?,
                        station = COALESCE((SELECT name FROM station WHERE id = ?), '')
                  WHERE id = ? AND role = 'staff' AND status = 'pending'
                    AND (station_id = '' OR station_id IS NULL)"
            );
            $claim->execute([$stationId, $stationId, $id]);
            if ($claim->rowCount() !== 1) {
                $pdo->rollBack();
                return ['error' => 'This applicant was already claimed by another owner.', 'status' => 409];
            }

            // The STAFF row is where permissions live (015).
            $staffPermissions = json_encode(self::STAFF_PERMISSIONS, JSON_UNESCAPED_SLASHES);
            $existing = Database::one('SELECT id FROM staff WHERE user_id = ? LIMIT 1', [$id]);
            if ($existing === null) {
                Database::run(
                    'INSERT INTO staff (id, user_id, station_id, approved_by, status, permissions)
                     VALUES (?, ?, ?, ?, ?, ?)',
                    [Database::uuid(), $id, $stationId, $approverId !== '' ? $approverId : null, 'active', $staffPermissions]
                );
            } else {
                Database::run(
                    'UPDATE staff SET station_id = ?, approved_by = ?, status = ?,
                            permissions = COALESCE(permissions, ?) WHERE id = ?',
                    [$stationId, $approverId !== '' ? $approverId : null, 'active', $staffPermissions, $existing['id']]
                );
            }
            $pdo->commit();
        } catch (\PDOException $e) {
            $pdo->rollBack();
            return ['error' => 'Database error: ' . $e->getMessage(), 'status' => 500];
        }

        return ['approval' => self::publicUser((array) self::findById($id))];
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

            // A pending or rejected staff account keeps no staff access, even
            // if it still holds a session created before the decision.
            if ($role === 'staff' && ($ctx->user['status'] ?? 'active') !== 'active') {
                Response::fail('Your staff account is awaiting owner approval.', 403);
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
        $permissions = json_decode((string) ($row['staff_permissions'] ?? '[]'), true);

        return [
            'id'          => $row['id'],
            'email'       => $row['email'],
            'name'        => (string) ($row['full_name'] ?? ''),
            'role'        => $row['role'],
            'station'     => (string) ($row['station_name'] ?? $row['station'] ?? ''),
            'stationId'   => (string) ($row['station_id'] ?? ''),
            'permissions' => is_array($permissions) ? $permissions : [],
            'status'      => (string) ($row['status'] ?? 'active'),
            'emailVerified' => (bool) ($row['email_verified'] ?? 1),
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
