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
        $rawPhone = $ctx->input('phone');
        $phone = is_scalar($rawPhone) ? trim((string) $rawPhone) : '';
        $phone = $phone !== '' ? $phone : null;

        $result = Auth::createUser(
            $email,
            $password,
            $fullName,
            $role,
            $ctx->str('station'),
            $phone,
            (int) $ctx->input('remember', 0)
        );

        if (isset($result['error'])) {
            Response::redirect("/auth/$role/register?error=" . rawurlencode((string) $result['error']));
        }

        try {
            sendWelcomeEmail($email, $fullName, $role);
        } catch (\Throwable $e) {
            // Email delivery is best-effort; the committed account remains valid.
            error_log('AquaTracker welcome email failed: ' . $e->getMessage());
        }

        // New staff cannot sign in until an owner approves the request.
        if ($role === 'staff') {
            Response::redirect('/auth/staff/login?notice=staff-pending');
        }

        /** @var array<string,mixed> $user */
        $user = $result['user'];
        Auth::login($user);

        Response::redirect(AQ_ROLE_LANDING[$role] ?? '/customer-dashboard.html');
    }

    private static function handleLogin(RouteContext $ctx, string $role, string $email, string $password): never
    {
        // Surface the "awaiting approval" notice rather than a generic failure.
        $pending = Auth::findByEmail($email);
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
        $email    = $ctx->str('email');
        $password = (string) $ctx->input('password', '');
        $role     = $ctx->str('role');

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
     * GET /api/staff-approvals — owner view of staff awaiting approval,
     * scoped to the owner's own station.
     */
    public static function listApprovals(RouteContext $ctx): never
    {
        $stationId = OwnerController::stationId($ctx->user);
        Response::json([
            'approvals' => Auth::listPendingStaff($stationId, OwnerController::stationName($stationId)),
        ]);
    }

    /** POST /api/staff-approvals/:id - approve or reject a pending staff account. */
    public static function decideApproval(RouteContext $ctx): never
    {
        $stationId = OwnerController::stationId($ctx->user);
        $approval = Auth::decideStaffApproval(
            $ctx->param('id'),
            $stationId,
            OwnerController::stationName($stationId),
            trim((string) $ctx->input('decision', '')),
            (string) $ctx->user['id']
        );

        if ($approval === null) {
            Response::fail('Approval request not found.', 404);
        }

        Response::json(['approval' => $approval]);
    }

    /** PATCH /api/profile — save the signed-in customer's account details. */
    public static function updateProfile(RouteContext $ctx): never
    {
        $updated = Auth::updateProfile((string) $ctx->user['id'], [
            'name'     => $ctx->str('name'),
            'email'    => $ctx->str('email'),
            'phone'    => $ctx->str('phone'),
            'location' => $ctx->str('location'),
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
