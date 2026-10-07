<?php
/**
 * Thin PDO wrapper. One shared connection per request, prepared statements
 * everywhere, and a friendly failure mode when the database has not been
 * installed yet (a very likely first-run state after a fresh XAMPP install).
 */

declare(strict_types=1);

namespace AquaTracker;

use PDO;
use PDOException;
use RuntimeException;

final class Database
{
    private static ?PDO $pdo = null;

    /** Connection string without a database, used by the installer. */
    public static function serverDsn(): string
    {
        return sprintf(
            'mysql:host=%s;port=%d;charset=utf8mb4',
            AQ_DB_HOST,
            AQ_DB_PORT
        );
    }

    public static function pdo(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $dsn = self::serverDsn() . ';dbname=' . AQ_DB_NAME;

        try {
            self::$pdo = new PDO($dsn, AQ_DB_USER, AQ_DB_PASS, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                // Real prepared statements: keeps types intact and avoids
                // emulated-prepare quirks with LIMIT/IN on older MariaDB.
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (PDOException $e) {
            throw new RuntimeException(self::diagnose($e), 0, $e);
        }

        return self::$pdo;
    }

    /** Opens a connection without selecting a database (installer only). */
    public static function serverPdo(): PDO
    {
        try {
            return new PDO(self::serverDsn(), AQ_DB_USER, AQ_DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
        } catch (PDOException $e) {
            // Same friendly wording as the pooled connection, so a wrong
            // password reads the same whether it fails here or at runtime.
            throw new RuntimeException(self::diagnose($e), 0, $e);
        }
    }

    /**
     * Turns a raw PDO message into something actionable. The raw text names
     * the host and user, which is noise when all you want to know is whether
     * the password is wrong or the schema is missing.
     */
    private static function diagnose(PDOException $e): string
    {
        $code = $e->errorInfo[1] ?? 0;

        return match ($code) {
            1045 => 'MySQL rejected the credentials. Check AQ_DB_USER and AQ_DB_PASS in php-backend/api/config.php.',
            1049 => sprintf(
                'Database "%s" does not exist. Open http://localhost:8080/install to create it.',
                AQ_DB_NAME
            ),
            2002 => sprintf('Cannot reach MySQL on %s:%d. Is it running in the XAMPP control panel?', AQ_DB_HOST, AQ_DB_PORT),
            default => 'Database connection failed: ' . $e->getMessage(),
        };
    }

    /** @param array<string|int,mixed> $params */
    public static function run(string $sql, array $params = []): \PDOStatement
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    /**
     * @param array<string|int,mixed> $params
     * @return array<int,array<string,mixed>>
     */
    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    /**
     * @param array<string|int,mixed> $params
     * @return array<string,mixed>|null
     */
    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public static function scalar(string $sql, array $params = []): mixed
    {
        $value = self::run($sql, $params)->fetchColumn();
        return $value === false ? null : $value;
    }

    /** Public key generator, mirroring the UUIDs the Node store used. */
    public static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40); // version 4
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80); // variant 1
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }

    /** Drops the cached handle so the installer can switch databases. */
    public static function reset(): void
    {
        self::$pdo = null;
    }
}