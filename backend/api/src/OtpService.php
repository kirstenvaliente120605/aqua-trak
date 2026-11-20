<?php

declare(strict_types=1);

namespace AquaTracker;

interface OtpStore
{
    public function transaction(callable $callback): mixed;

    public function latestOtp(string $email, string $purpose, bool $forUpdate = false): ?array;

    public function invalidateOtps(string $email, string $purpose): void;

    public function insertOtp(string $email, ?string $userId, string $purpose, string $hash, int $expiryMinutes): int;

    public function markOtpUsed(int $id): void;

    public function incrementOtpAttempts(int $id): int;

    public function addRateLimitHit(string $scope, string $keyHash, string $action): int;

    public function insertResetToken(string $email, string $userId, string $tokenHash, int $expiryMinutes): void;

    public function validResetToken(string $email, string $tokenHash, bool $forUpdate = false): ?array;

    public function markResetTokenUsed(string $tokenHash): void;

    public function invalidateResetTokens(string $userId): void;
}

final class DatabaseOtpStore implements OtpStore
{
    public function transaction(callable $callback): mixed
    {
        $pdo = Database::pdo();
        $ownsTransaction = !$pdo->inTransaction();
        if ($ownsTransaction) {
            $pdo->beginTransaction();
        }

        try {
            $result = $callback();
            if ($ownsTransaction) {
                $pdo->commit();
            }
            return $result;
        } catch (\Throwable $e) {
            if ($ownsTransaction && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    public function latestOtp(string $email, string $purpose, bool $forUpdate = false): ?array
    {
        return Database::one(
            'SELECT id, email, user_id, code_hash, purpose, expires_at, attempts, created_at, used_at
             FROM email_otps
             WHERE email = ? AND purpose = ?
             ORDER BY id DESC LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : ''),
            [$email, $purpose]
        );
    }

    public function invalidateOtps(string $email, string $purpose): void
    {
        Database::run(
            'UPDATE email_otps SET used_at = COALESCE(used_at, NOW())
             WHERE email = ? AND purpose = ? AND used_at IS NULL',
            [$email, $purpose]
        );
    }

    public function insertOtp(string $email, ?string $userId, string $purpose, string $hash, int $expiryMinutes): int
    {
        Database::run(
            'INSERT INTO email_otps (email, user_id, code_hash, purpose, expires_at, attempts, created_at)
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ' . max(1, $expiryMinutes) . ' MINUTE), 0, NOW())',
            [$email, $userId, $hash, $purpose]
        );
        return (int) Database::pdo()->lastInsertId();
    }

    public function markOtpUsed(int $id): void
    {
        Database::run('UPDATE email_otps SET used_at = COALESCE(used_at, NOW()) WHERE id = ?', [$id]);
    }

    public function incrementOtpAttempts(int $id): int
    {
        Database::run('UPDATE email_otps SET attempts = attempts + 1 WHERE id = ?', [$id]);
        return (int) Database::scalar('SELECT attempts FROM email_otps WHERE id = ?', [$id]);
    }

    public function addRateLimitHit(string $scope, string $keyHash, string $action): int
    {
        Database::run(
            'INSERT INTO otp_rate_limits (scope, key_hash, action, window_started_at, request_count)
             VALUES (?, ?, ?, NOW(), 1)
             ON DUPLICATE KEY UPDATE
                request_count = IF(window_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR), 1, request_count + 1),
                window_started_at = IF(window_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR), NOW(), window_started_at)',
            [$scope, $keyHash, $action]
        );
        return (int) Database::scalar(
            'SELECT request_count FROM otp_rate_limits WHERE scope = ? AND key_hash = ? AND action = ?',
            [$scope, $keyHash, $action]
        );
    }

    public function insertResetToken(string $email, string $userId, string $tokenHash, int $expiryMinutes): void
    {
        Database::run(
            'INSERT INTO password_reset_tokens (token_hash, email, user_id, expires_at, created_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ' . max(1, $expiryMinutes) . ' MINUTE), NOW())',
            [$tokenHash, $email, $userId]
        );
    }

    public function validResetToken(string $email, string $tokenHash, bool $forUpdate = false): ?array
    {
        return Database::one(
            'SELECT token_hash, email, user_id, expires_at, used_at
             FROM password_reset_tokens
             WHERE email = ? AND token_hash = ? AND used_at IS NULL AND expires_at > NOW()
             LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : ''),
            [$email, $tokenHash]
        );
    }

    public function markResetTokenUsed(string $tokenHash): void
    {
        Database::run('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = ?', [$tokenHash]);
    }

    public function invalidateResetTokens(string $userId): void
    {
        Database::run(
            'UPDATE password_reset_tokens SET used_at = COALESCE(used_at, NOW())
             WHERE user_id = ? AND used_at IS NULL',
            [$userId]
        );
    }
}

final class OtpService
{
    private \Closure $sendEmail;

    public function __construct(
        private readonly OtpStore $store,
        callable $sendEmail,
        private readonly int $expiryMinutes = 10,
        private readonly int $maxAttempts = 5,
        private readonly int $cooldownSeconds = 60,
        private readonly int $emailLimitPerHour = 5,
        private readonly int $ipLimitPerHour = 20,
    ) {
        $this->sendEmail = \Closure::fromCallable($sendEmail);
    }

    public static function generateCode(): string
    {
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }

    public static function hashCode(string $code): string
    {
        return password_hash($code, PASSWORD_DEFAULT);
    }

    public static function codeMatches(string $code, string $hash): bool
    {
        return preg_match('/^\d{6}$/', $code) === 1 && password_verify($code, $hash);
    }

    /** @return array{ok:bool,code?:string} */
    public function issue(string $email, ?string $userId, string $purpose, string $ip): array
    {
        if (!in_array($purpose, ['verify_email', 'reset_password'], true)) {
            return ['ok' => false, 'code' => 'INVALID_PURPOSE'];
        }

        $email = strtolower(trim($email));
        $action = 'send:' . $purpose;
        if (!$this->withinRateLimits($email, $ip, $action, $this->emailLimitPerHour, $this->ipLimitPerHour)) {
            return ['ok' => false, 'code' => 'OTP_RATE_LIMITED'];
        }

        if ($userId === null) {
            return ['ok' => true];
        }

        $latest = $this->store->latestOtp($email, $purpose);
        if ($latest !== null) {
            $age = time() - (strtotime((string) $latest['created_at']) ?: time());
            if ($age < $this->cooldownSeconds) {
                return ['ok' => false, 'code' => 'OTP_COOLDOWN'];
            }
        }

        $code = self::generateCode();
        $this->store->transaction(function () use ($email, $userId, $purpose, $code): void {
            $this->store->invalidateOtps($email, $purpose);
            $this->store->insertOtp($email, $userId, $purpose, self::hashCode($code), $this->expiryMinutes);
        });

        try {
            ($this->sendEmail)(['to' => $email, 'code' => $code, 'purpose' => $purpose]);
        } catch (\Throwable $e) {
            error_log('OTP email delivery failed; provider details suppressed.');
            return ['ok' => false, 'code' => 'OTP_DELIVERY_FAILED'];
        }

        if (getenv('APP_ENV') === 'development' && filter_var(getenv('OTP_DEBUG'), FILTER_VALIDATE_BOOLEAN)) {
            error_log("OTP_DEBUG {$purpose} code for {$email}: {$code}");
        }

        return ['ok' => true];
    }

    /** @return array{ok:bool,code?:string,resetToken?:string,userId?:string} */
    public function verify(string $email, string $code, string $purpose, string $ip = 'unknown'): array
    {
        $email = strtolower(trim($email));
        if (!in_array($purpose, ['verify_email', 'reset_password'], true) || preg_match('/^\d{6}$/', $code) !== 1) {
            return ['ok' => false, 'code' => 'OTP_INVALID'];
        }
        if (!$this->withinRateLimits($email, $ip, 'verify:' . $purpose, 10, 50)) {
            return ['ok' => false, 'code' => 'OTP_RATE_LIMITED'];
        }

        return $this->store->transaction(function () use ($email, $code, $purpose): array {
            $otp = $this->store->latestOtp($email, $purpose, true);
            if ($otp === null) {
                return ['ok' => false, 'code' => 'OTP_INVALID'];
            }
            if ((int) $otp['attempts'] >= $this->maxAttempts) {
                return ['ok' => false, 'code' => 'OTP_TOO_MANY_ATTEMPTS'];
            }
            if (!empty($otp['used_at'])) {
                return ['ok' => false, 'code' => 'OTP_INVALID'];
            }
            if ((strtotime((string) $otp['expires_at']) ?: 0) <= time()) {
                $this->store->markOtpUsed((int) $otp['id']);
                return ['ok' => false, 'code' => 'OTP_EXPIRED'];
            }

            if (!self::codeMatches($code, (string) $otp['code_hash'])) {
                $attempts = $this->store->incrementOtpAttempts((int) $otp['id']);
                if ($attempts >= $this->maxAttempts) {
                    $this->store->markOtpUsed((int) $otp['id']);
                    return ['ok' => false, 'code' => 'OTP_TOO_MANY_ATTEMPTS'];
                }
                return ['ok' => false, 'code' => 'OTP_INVALID'];
            }

            $this->store->markOtpUsed((int) $otp['id']);
            if ($purpose === 'reset_password') {
                $token = bin2hex(random_bytes(32));
                $userId = (string) $otp['user_id'];
                $this->store->insertResetToken($email, $userId, hash('sha256', $token), $this->expiryMinutes);
                return ['ok' => true, 'resetToken' => $token, 'userId' => $userId];
            }
            return ['ok' => true, 'userId' => (string) $otp['user_id']];
        });
    }

    public function useResetToken(string $email, string $token, callable $resetPassword): bool
    {
        if (!preg_match('/^[a-f0-9]{64}$/i', $token)) {
            return false;
        }
        $email = strtolower(trim($email));
        $tokenHash = hash('sha256', $token);

        return $this->store->transaction(function () use ($email, $tokenHash, $resetPassword): bool {
            $record = $this->store->validResetToken($email, $tokenHash, true);
            if ($record === null || !hash_equals((string) $record['token_hash'], $tokenHash)) {
                return false;
            }
            $this->store->markResetTokenUsed($tokenHash);
            $resetPassword((string) $record['user_id']);
            $this->store->invalidateResetTokens((string) $record['user_id']);
            return true;
        });
    }

    private function withinRateLimits(string $email, string $ip, string $action, int $emailLimit, int $ipLimit): bool
    {
        $emailCount = $this->store->addRateLimitHit('email', hash('sha256', $email), $action);
        $ipCount = $this->store->addRateLimitHit('ip', hash('sha256', $ip), $action);
        return $emailCount <= $emailLimit && $ipCount <= $ipLimit;
    }
}
