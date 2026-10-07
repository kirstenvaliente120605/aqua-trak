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

        $result = Auth::createUser(
            $email,
            $password,
            $ctx->str('name'),
            $role,
            $ctx->str('station')
        );

        if (isset($result['error'])) {
            Response::redirect("/auth/$role/register?error=" . rawurlencode((string) $result['error']));
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
        Response::json([
            'approvals' => Auth::listPendingStaff((string) ($ctx->user['station'] ?? '')),
        ]);
    }

    /** POST /api/staff-approvals/:id — approve or reject a pending staff account. */
    public static function decideApproval(RouteContext $ctx): never
    {
        $approval = Auth::decideStaffApproval(
            $ctx->param('id'),
            (string) ($ctx->user['station'] ?? ''),
            trim((string) $ctx->input('decision', ''))
        );

        if ($approval === null) {
            Response::fail('Approval request not found.', 404);
        }

        Response::json(['approval' => $approval]);
    }

    private static function validRoleMode(string $role, string $mode): bool
    {
        return in_array($role, AQ_ROLES, true) && in_array($mode, ['login', 'register'], true);
    }
}