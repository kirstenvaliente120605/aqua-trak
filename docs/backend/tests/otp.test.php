<?php

declare(strict_types=1);

namespace AquaTracker;

require_once __DIR__ . '/../api/src/OtpService.php';

final class FakeOtpStore implements OtpStore
{
    public array $otps = [];
    public array $rateLimits = [];
    public array $tokens = [];
    private int $nextId = 1;

    public function transaction(callable $callback): mixed
    {
        return $callback();
    }

    public function latestOtp(string $email, string $purpose, bool $forUpdate = false): ?array
    {
        foreach (array_reverse($this->otps, true) as $otp) {
            if ($otp['email'] === $email && $otp['purpose'] === $purpose) {
                return $otp;
            }
        }
        return null;
    }

    public function invalidateOtps(string $email, string $purpose): void
    {
        foreach ($this->otps as &$otp) {
            if ($otp['email'] === $email && $otp['purpose'] === $purpose && $otp['used_at'] === null) {
                $otp['used_at'] = date('Y-m-d H:i:s');
            }
        }
        unset($otp);
    }

    public function insertOtp(string $email, ?string $userId, string $purpose, string $hash, int $expiryMinutes): int
    {
        $id = $this->nextId++;
        $this->otps[$id] = [
            'id' => $id,
            'email' => $email,
            'user_id' => $userId,
            'code_hash' => $hash,
            'purpose' => $purpose,
            'expires_at' => date('Y-m-d H:i:s', time() + ($expiryMinutes * 60)),
            'attempts' => 0,
            'created_at' => date('Y-m-d H:i:s'),
            'used_at' => null,
        ];
        return $id;
    }

    public function markOtpUsed(int $id): void
    {
        $this->otps[$id]['used_at'] = date('Y-m-d H:i:s');
    }

    public function incrementOtpAttempts(int $id): int
    {
        return ++$this->otps[$id]['attempts'];
    }

    public function addRateLimitHit(string $scope, string $keyHash, string $action): int
    {
        $key = implode(':', [$scope, $keyHash, $action]);
        return $this->rateLimits[$key] = ($this->rateLimits[$key] ?? 0) + 1;
    }

    public function insertResetToken(string $email, string $userId, string $tokenHash, int $expiryMinutes): void
    {
        $this->tokens[$tokenHash] = [
            'token_hash' => $tokenHash,
            'email' => $email,
            'user_id' => $userId,
            'expires_at' => date('Y-m-d H:i:s', time() + ($expiryMinutes * 60)),
            'used_at' => null,
        ];
    }

    public function validResetToken(string $email, string $tokenHash, bool $forUpdate = false): ?array
    {
        $token = $this->tokens[$tokenHash] ?? null;
        if (
            $token === null
            || $token['email'] !== $email
            || $token['used_at'] !== null
            || strtotime($token['expires_at']) <= time()
        ) {
            return null;
        }
        return $token;
    }

    public function markResetTokenUsed(string $tokenHash): void
    {
        $this->tokens[$tokenHash]['used_at'] = date('Y-m-d H:i:s');
    }

    public function invalidateResetTokens(string $userId): void
    {
        foreach ($this->tokens as &$token) {
            if ($token['user_id'] === $userId) {
                $token['used_at'] = date('Y-m-d H:i:s');
            }
        }
        unset($token);
    }
}

$passed = 0;
$failed = 0;

function check(bool $condition, string $label): void
{
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "ok  {$label}\n";
    } else {
        $failed++;
        fwrite(STDERR, "FAIL {$label}\n");
    }
}

check((bool) preg_match('/^\d{6}$/', OtpService::generateCode()), 'OTP generation returns six digits');
$hash = OtpService::hashCode('004219');
check($hash !== '004219' && OtpService::codeMatches('004219', $hash), 'OTP is hashed and verifies');
check(!OtpService::codeMatches('004218', $hash), 'OTP mismatch is rejected');

$store = new FakeOtpStore();
$sent = [];
$service = new OtpService($store, static function (array $mail) use (&$sent): void {
    $sent[] = $mail;
});
$issued = $service->issue('person@example.com', 'user-1', 'verify_email', '127.0.0.1');
check($issued['ok'] && count($sent) === 1, 'Brevo mail call is mockable and receives the OTP');
check(isset($store->otps[1]['code_hash']) && $store->otps[1]['code_hash'] !== $sent[0]['code'], 'Only the OTP hash is persisted');
check($service->issue('person@example.com', 'user-1', 'verify_email', '127.0.0.1')['code'] === 'OTP_COOLDOWN', 'Resend cooldown blocks a second code');

$wrong = null;
for ($attempt = 0; $attempt < 5; $attempt++) {
    $wrong = $service->verify('person@example.com', '111111', 'verify_email');
}
check($wrong['code'] === 'OTP_TOO_MANY_ATTEMPTS', 'OTP is invalidated after five wrong attempts');
check(!$service->verify('person@example.com', $sent[0]['code'], 'verify_email')['ok'], 'OTP cannot be used after the attempt limit');

$expiryStore = new FakeOtpStore();
$expiryService = new OtpService($expiryStore, static function (array $mail): void {});
$expiryService->issue('expired@example.com', 'user-2', 'verify_email', '127.0.0.1');
$expiryStore->otps[1]['expires_at'] = date('Y-m-d H:i:s', time() - 1);
check($expiryService->verify('expired@example.com', '000000', 'verify_email')['code'] === 'OTP_EXPIRED', 'Expired OTP is rejected');

$singleStore = new FakeOtpStore();
$singleSent = [];
$singleService = new OtpService($singleStore, static function (array $mail) use (&$singleSent): void {
    $singleSent[] = $mail;
});
$singleService->issue('single@example.com', 'user-3', 'verify_email', '127.0.0.1');
$firstUse = $singleService->verify('single@example.com', $singleSent[0]['code'], 'verify_email');
check($firstUse['ok'] && !$singleService->verify('single@example.com', $singleSent[0]['code'], 'verify_email')['ok'], 'OTP is single-use');

$resetStore = new FakeOtpStore();
$resetSent = [];
$resetService = new OtpService($resetStore, static function (array $mail) use (&$resetSent): void {
    $resetSent[] = $mail;
});
$resetService->issue('reset@example.com', 'user-4', 'reset_password', '127.0.0.1');
$reset = $resetService->verify('reset@example.com', $resetSent[0]['code'], 'reset_password');
$changedUser = null;
$used = $resetService->useResetToken('reset@example.com', $reset['resetToken'], static function (string $userId) use (&$changedUser): void {
    $changedUser = $userId;
});
check($used && $changedUser === 'user-4', 'Reset token performs the password update callback');
check(!$resetService->useResetToken('reset@example.com', $reset['resetToken'], static function (): void {}), 'Reset token is single-use');
$expiredToken = bin2hex(random_bytes(32));
$expiredHash = hash('sha256', $expiredToken);
$resetStore->tokens[$expiredHash] = [
    'token_hash' => $expiredHash,
    'email' => 'reset@example.com',
    'user_id' => 'user-4',
    'expires_at' => date('Y-m-d H:i:s', time() - 1),
    'used_at' => null,
];
check(!$resetService->useResetToken('reset@example.com', $expiredToken, static function (): void {}), 'Expired reset token is rejected');

$rateStore = new FakeOtpStore();
$rateService = new OtpService($rateStore, static function (array $mail): void {});
for ($count = 0; $count < 5; $count++) {
    $rateService->issue('limited@example.com', 'user-5', 'verify_email', '127.0.0.1');
    if ($rateStore->otps !== []) {
        $lastId = array_key_last($rateStore->otps);
        $rateStore->otps[$lastId]['created_at'] = date('Y-m-d H:i:s', time() - 61);
    }
}
check($rateService->issue('limited@example.com', 'user-5', 'verify_email', '127.0.0.1')['code'] === 'OTP_RATE_LIMITED', 'Email rate limit blocks repeated requests');

$ipStore = new FakeOtpStore();
$ipService = new OtpService($ipStore, static function (array $mail): void {}, 10, 5, 60, 100, 1);
$ipService->issue('first@example.com', 'user-7', 'verify_email', '127.0.0.1');
$lastId = array_key_last($ipStore->otps);
$ipStore->otps[$lastId]['created_at'] = date('Y-m-d H:i:s', time() - 61);
check($ipService->issue('second@example.com', 'user-8', 'verify_email', '127.0.0.1')['code'] === 'OTP_RATE_LIMITED', 'IP rate limit blocks repeated requests across emails');

$failedMailService = new OtpService(new FakeOtpStore(), static function (array $mail): void {
    throw new \RuntimeException('provider response must not be sent to a client');
});
check($failedMailService->issue('mail@example.com', 'user-6', 'verify_email', '127.0.0.1')['code'] === 'OTP_DELIVERY_FAILED', 'Brevo failure becomes a safe generic result');

echo "\n{$passed} passed, {$failed} failed\n";
exit($failed === 0 ? 0 : 1);
