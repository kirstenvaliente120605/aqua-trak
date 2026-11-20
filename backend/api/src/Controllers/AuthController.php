<?php
/**
 * Sign-in, sign-up and session endpoints.
 *
 * The auth page posts a native HTML form to /auth/<role>/<mode>, so this
 * controller answers with redirects and query-string notices rather than JSON.
 * That contract is unchanged from the Express backend.
 */

declare(strict_types=1);

namespace AquaTracker;

final class AuthController
{
    /** GET /api/auth/me — the client calls this on every page load. */
    public static function me(RouteContext $ctx): never
    {
        $user = Auth::currentUser();

        if ($user === null) {
            Response::json(['authenticated' => false], 401);
        }

        Response::json(['authenticated' => true, 'user' => $user]);
    }

    /** GET /auth/<role>/<mode> — serves the shared auth.html shell. */
    public static function formPage(RouteContext $ctx): never
    {
        if (!self::validRoleMode($ctx->param('role'), $ctx->param('mode'))) {
            Response::redirect('/404');
        }

        Response::page('auth.html');
    }

    /** POST /auth/<role>/<mode> — the login and registration form target. */
    public static function submitForm(RouteContext $ctx): never
    {
        $role = $ctx->param('role');
        $mode = $ctx->param('mode');

        if (!self::validRoleMode($role, $mode)) {
            Response::redirect('/404');
        }

        $email    = $ctx->str('email');
        $password = (string) $ctx->input('password', '');

        if ($mode === 'register') {
            self::handleRegister($ctx, $role, $email, $password);
        }

        self::handleLogin($ctx, $role, $email, $password);
    }

    private static function handleRegister(RouteContext $ctx, string $role, string $email, string $password): never
    {
        if ($password !== (string) $ctx->input('confirmPassword', $password)) {
            Response::redirect("/auth/$role/register?error=passwords");
        }

        $fullName = $ctx->str('name');
        $result = Auth::createUser(
            $email,
            $password,
            $fullName,
            $role,
            $role === 'owner' ? $ctx->str('station') : ''
        );

        if (isset($result['error'])) {
            Response::redirect("/auth/$role/register?error=" . rawurlencode((string) $result['error']));
        }

        $otp = self::otpService()->issue($email, (string) $result['user']['id'], 'verify_email', self::requestIp());
        $error = !$otp['ok']
            ? '&delivery=failed'
            : '';
        Response::redirect(
            "/auth/$role/login?error=email_not_verified&email=" . rawurlencode($email) . $error
        );
    }

    private static function handleLogin(RouteContext $ctx, string $role, string $email, string $password): never
    {
        $pending = Auth::findByEmail($email);
        if (
            $pending !== null
            && (int) ($pending['email_verified'] ?? 1) !== 1
            && password_verify($password, (string) $pending['password_hash'])
        ) {
            Response::redirect("/auth/$role/login?error=email_not_verified&email=" . rawurlencode($email));
        }
        // Surface the "awaiting approval" notice rather than a generic failure.
        if ($pending !== null && $pending['role'] === $role && $pending['status'] === 'pending') {
            Response::redirect("/auth/$role/login?notice=staff-pending");
        }

        $user = Auth::authenticate($email, $password);
        if ($user === null) {
            Response::redirect("/auth/$role/login?error=invalid");
        }
        if ($user['role'] !== $role) {
            Response::redirect("/auth/$role/login?error=role");
        }

        Auth::login(Auth::publicUser($user));
        Response::redirect(AQ_ROLE_LANDING[$role] ?? '/customer-dashboard.html');
    }

    /**
     * POST /auth/login — JSON login used by the demo role switcher in
     * js/auth.js. The Express backend had no route for this, so the switcher
     * always fell through to a 404 and raised "Demo login failed".
     */
    public static function loginJson(RouteContext $ctx): never
    {
        $email = strtolower($ctx->str('email'));
        $password = (string) $ctx->input('password', '');
        $role = $ctx->str('role');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
            Response::json(['error' => 'Enter a valid email address and password.', 'code' => 'INVALID_INPUT'], 400);
        }

        $candidate = Auth::findByEmail($email);
        if ($candidate === null || !password_verify($password, (string) $candidate['password_hash'])) {
            Response::fail('Invalid email or password.', 401);
        }
        if ($role !== '' && !in_array($role, AQ_ROLES, true)) {
            Response::json(['error' => 'Choose a valid account role.', 'code' => 'INVALID_INPUT'], 400);
        }
        if ($role !== '' && $candidate['role'] !== $role) {
            Response::fail('That account is not registered as a ' . $role . '.', 403);
        }
        if ((int) ($candidate['email_verified'] ?? 1) !== 1) {
            Response::json([
                'error' => 'Verify your email address before signing in.',
                'code' => 'EMAIL_NOT_VERIFIED',
            ], 403);
        }
        if (($candidate['status'] ?? 'active') !== 'active') {
            Response::json([
                'error' => 'Your staff account is waiting for owner approval.',
                'code' => 'STAFF_PENDING',
            ], 403);
        }

        $user = Auth::authenticate($email, $password);
        if ($user === null) {
            Response::fail('Invalid email or password.', 401);
        }
        if ($role !== '' && $user['role'] !== $role) {
            Response::fail('That account is not registered as a ' . $role . '.', 403);
        }

        $public = Auth::publicUser($user);
        Auth::login($public);

        Response::json([
            'ok'          => true,
            'user'        => $public,
            'redirectUrl' => AQ_ROLE_LANDING[$user['role']] ?? '/customer-dashboard.html',
        ]);
    }

    public static function signup(RouteContext $ctx): never
    {
        $email = strtolower($ctx->str('email'));
        $password = (string) $ctx->input('password', '');
        $role = $ctx->str('role', 'customer');
        $name = $ctx->str('name');
        $station = $ctx->str('station');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !in_array($role, AQ_ROLES, true)) {
            Response::json(['error' => 'Enter a valid email and account type.', 'code' => 'INVALID_INPUT'], 400);
        }
        if (strlen($password) < 8 || strlen($password) > 128) {
            Response::json(['error' => 'Password must be between 8 and 128 characters.', 'code' => 'INVALID_INPUT'], 400);
        }
        if ($ctx->input('confirmPassword') !== null && $password !== (string) $ctx->input('confirmPassword')) {
            Response::json(['error' => 'Passwords must match.', 'code' => 'INVALID_INPUT'], 400);
        }

        $created = Auth::createUser($email, $password, $name, $role, $station);
        if (isset($created['error'])) {
            $error = (string) $created['error'];
            if (str_starts_with($error, 'Database error:')) {
                error_log('Signup database operation failed.');
                Response::json(['error' => 'Account creation failed. Please try again.', 'code' => 'SIGNUP_FAILED'], 500);
            }
            Response::json(['error' => $error, 'code' => 'SIGNUP_INVALID'], 400);
        }

        $otp = self::otpService()->issue($email, (string) $created['user']['id'], 'verify_email', self::requestIp());
        if (!$otp['ok']) {
            $code = (string) ($otp['code'] ?? 'OTP_DELIVERY_FAILED');
            Response::json([
                'error' => $code === 'OTP_RATE_LIMITED'
                    ? 'Too many verification requests. Please try again later.'
                    : 'Your account was created, but we could not send a code. Please try again later.',
                'code' => $code,
                'email' => $email,
            ], $code === 'OTP_RATE_LIMITED' ? 429 : 503);
        }

        Response::json([
            'ok' => true,
            'message' => 'A verification code has been sent to your email.',
            'email' => $email,
        ], 201);
    }

    public static function verifyEmail(RouteContext $ctx): never
    {
        $email = strtolower($ctx->str('email'));
        $code = $ctx->str('otp');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || preg_match('/^\d{6}$/', $code) !== 1) {
            Response::json(['error' => 'Enter a valid email and six-digit code.', 'code' => 'INVALID_INPUT'], 400);
        }

        $verification = self::otpService()->verify($email, $code, 'verify_email', self::requestIp());
        if (!$verification['ok']) {
            self::respondOtpError((string) ($verification['code'] ?? 'OTP_INVALID'));
        }
        $user = Auth::findByEmail($email);
        if ($user === null || (string) $user['id'] !== (string) ($verification['userId'] ?? '')) {
            Response::fail('This verification code is no longer valid.', 400);
        }

        $public = Auth::markEmailVerified((string) $user['id']);
        if ($public === null) {
            Response::fail('Account not found.', 404);
        }
        if (($user['status'] ?? 'active') !== 'active') {
            Response::json([
                'ok' => true,
                'user' => $public,
                'notice' => 'Your staff account is waiting for owner approval.',
                'redirectUrl' => '/auth/staff/login?notice=staff-pending',
            ]);
        }

        Auth::login($public);
        Response::json([
            'ok' => true,
            'user' => $public,
            'redirectUrl' => AQ_ROLE_LANDING[$user['role']] ?? '/customer-dashboard.html',
        ]);
    }

    public static function resendOtp(RouteContext $ctx): never
    {
        $email = strtolower($ctx->str('email'));
        $purpose = $ctx->str('purpose');
        if (
            !filter_var($email, FILTER_VALIDATE_EMAIL)
            || !in_array($purpose, ['verify_email', 'reset_password'], true)
        ) {
            Response::json(['error' => 'Enter a valid email and code purpose.', 'code' => 'INVALID_INPUT'], 400);
        }

        $user = Auth::findByEmail($email);
        $canSend = $user !== null
            && !($purpose === 'verify_email' && (int) ($user['email_verified'] ?? 1) === 1);
        self::otpService()->issue(
            $email,
            $canSend ? (string) $user['id'] : null,
            $purpose,
            self::requestIp()
        );
        Response::json(['ok' => true, 'message' => 'If the account can receive a code, one will be sent shortly.']);
    }

    public static function forgotPassword(RouteContext $ctx): never
    {
        $email = strtolower($ctx->str('email'));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::json(['error' => 'Enter a valid email address.', 'code' => 'INVALID_INPUT'], 400);
        }

        $stage = 'user lookup';
        try {
            $user = Auth::findByEmail($email);
            $stage = 'OTP issuance';
            self::otpService()->issue(
                $email,
                $user === null ? null : (string) $user['id'],
                'reset_password',
                self::requestIp()
            );
        } catch (\Throwable $e) {
            error_log(sprintf(
                '[auth.forgot-password] Failed during %s (%s).',
                $stage,
                get_class($e)
            ));
            if (
                getenv('APP_ENV') === 'development'
                && filter_var(getenv('OTP_DEBUG'), FILTER_VALIDATE_BOOLEAN)
            ) {
                error_log('[auth.forgot-password] Debug details: ' . $e->getMessage());
            }
            Response::json([
                'error' => 'We could not process your request right now. Please try again later.',
                'code' => 'SERVICE_UNAVAILABLE',
            ], 503);
        }

        Response::json([
            'ok' => true,
            'message' => 'If an account exists for that email, a reset code will be sent shortly.',
        ]);
    }

    public static function verifyResetOtp(RouteContext $ctx): never
    {
        $email = strtolower($ctx->str('email'));
        $code = $ctx->str('otp');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || preg_match('/^\d{6}$/', $code) !== 1) {
            Response::json(['error' => 'Enter a valid email and six-digit code.', 'code' => 'INVALID_INPUT'], 400);
        }

        $result = self::otpService()->verify($email, $code, 'reset_password', self::requestIp());
        if (!$result['ok']) {
            self::respondOtpError((string) ($result['code'] ?? 'OTP_INVALID'));
        }
        Response::json([
            'ok' => true,
            'resetToken' => $result['resetToken'],
        ]);
    }

    public static function resetPassword(RouteContext $ctx): never
    {
        $email = strtolower($ctx->str('email'));
        $token = $ctx->str('resetToken');
        $password = (string) $ctx->input('newPassword', '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^[a-f0-9]{64}$/i', $token)) {
            Response::json(['error' => 'The password reset session is invalid. Request a new code.', 'code' => 'RESET_TOKEN_INVALID'], 400);
        }
        if (strlen($password) < 8 || strlen($password) > 128) {
            Response::json(['error' => 'Password must be between 8 and 128 characters.', 'code' => 'INVALID_INPUT'], 400);
        }

        $reset = self::otpService()->useResetToken(
            $email,
            $token,
            static fn (string $userId) => Auth::resetPassword($userId, $password)
        );
        if (!$reset) {
            Response::json(['error' => 'The password reset session expired or was already used. Request a new code.', 'code' => 'RESET_TOKEN_INVALID'], 400);
        }
        Response::json(['ok' => true, 'message' => 'Your password has been reset. Sign in with your new password.']);
    }

    private static function otpService(): OtpService
    {
        $setting = static function (string $name, int $default): int {
            $value = filter_var(getenv($name), FILTER_VALIDATE_INT);
            return $value !== false && $value > 0 ? $value : $default;
        };

        return new OtpService(
            new DatabaseOtpStore(),
            __NAMESPACE__ . '\\sendOtpEmail',
            min(60, $setting('OTP_EXPIRY_MINUTES', 10)),
            min(10, $setting('OTP_MAX_ATTEMPTS', 5)),
            min(3600, $setting('OTP_RESEND_COOLDOWN_SECONDS', 60))
        );
    }

    private static function requestIp(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    }

    private static function respondOtpError(string $code): never
    {
        [$status, $message] = match ($code) {
            'OTP_COOLDOWN' => [429, 'Please wait before requesting another code.'],
            'OTP_RATE_LIMITED' => [429, 'Too many requests. Please try again later.'],
            'OTP_EXPIRED' => [400, 'This code has expired. Request a new code.'],
            'OTP_TOO_MANY_ATTEMPTS' => [429, 'Too many incorrect attempts. Request a new code.'],
            'OTP_DELIVERY_FAILED' => [503, 'We could not send a code right now. Please try again later.'],
            default => [400, 'That code is incorrect or no longer valid.'],
        };
        Response::json(['error' => $message, 'code' => $code], $status);
    }

    /** GET /auth/logout — link-style logout. */
    public static function logoutGet(RouteContext $ctx): never
    {
        Auth::logout();
        Response::redirect('/');
    }

    /** POST /auth/logout — used by AquaAuth.logout() in js/auth.js. */
    public static function logoutPost(RouteContext $ctx): never
    {
        Auth::logout();
        Response::json(['ok' => true]);
    }

    /**
     * GET /api/staff-approvals — every unclaimed staff application. Applicants
     * are a shared queue, so all owners see them until one of them claims one.
     */
    public static function listApprovals(RouteContext $ctx): never
    {
        Response::json([
            'approvals' => Auth::listPendingStaff(),
        ]);
    }

    /**
     * POST /api/staff-approvals/:id - approve or reject a pending staff account.
     *
     * Approving needs `stationId`: one of the owner's own stations, which the
     * staff account is attached to. Rejecting needs no station.
     */
    public static function decideApproval(RouteContext $ctx): never
    {
        $decision = trim((string) $ctx->input('decision', ''));
        $stationId = trim((string) $ctx->input('stationId', ''));

        if ($stationId !== '' && !OwnerController::ownsStation((string) $ctx->user['id'], $stationId)) {
            Response::fail('Choose one of your own stations.', 400);
        }

        $result = Auth::decideStaffApproval(
            $ctx->param('id'),
            $stationId,
            $decision,
            (string) $ctx->user['id']
        );

        if ($result === null) {
            Response::fail('Approval request not found.', 404);
        }
        if (isset($result['error'])) {
            Response::fail((string) $result['error'], (int) ($result['status'] ?? 400));
        }

        Response::json(['approval' => $result['approval']]);
    }

    /** PATCH /api/profile — save the signed-in customer's account details. */
    public static function updateProfile(RouteContext $ctx): never
    {
        $updated = Auth::updateProfile((string) $ctx->user['id'], [
            'name'     => $ctx->str('name'),
            'email'    => $ctx->str('email'),
        ]);

        if ($updated === null) {
            Response::fail('Account not found.', 404);
        }
        if (isset($updated['error'])) {
            Response::fail((string) $updated['error'], 400);
        }

        Response::json(['success' => true, 'user' => $updated]);
    }

    /** POST /api/profile/password — change the signed-in customer's password. */
    public static function changePassword(RouteContext $ctx): never
    {
        $result = Auth::changePassword(
            (string) $ctx->user['id'],
            (string) $ctx->input('currentPassword', ''),
            (string) $ctx->input('newPassword', '')
        );

        if (isset($result['error'])) {
            Response::fail((string) $result['error'], 400);
        }

        Response::json(['success' => true]);
    }

    private static function validRoleMode(string $role, string $mode): bool
    {
        // The seeded administrator can sign in, but public admin registration
        // is never available.
        if ($role === 'admin') {
            return $mode === 'login';
        }

        return in_array($role, AQ_ROLES, true) && in_array($mode, ['login', 'register'], true);
    }
}
