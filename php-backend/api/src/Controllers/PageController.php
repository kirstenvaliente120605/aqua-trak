<?php
/**
 * Page routes. These reproduce the Express route table that served the static
 * frontend, so the same URLs work unchanged under Apache:
 *
 *   /                          landing page
 *   /auth/<role>/<mode>        login and registration
 *   /customer-dashboard.html   bare dashboard shells (client guards redirect)
 *   /dashboard/<role>          session-checked dashboards
 *   /dashboard/<role>/<section> redirects to the right shell + hash
 *   /404                       not-found page
 */

declare(strict_types=1);

namespace AquaTracker;

final class PageController
{
    public static function landing(RouteContext $ctx): never
    {
        Response::page('index.html');
    }

    /** Legacy path kept alive from the old public/ layout. */
    public static function legacyIndex(RouteContext $ctx): never
    {
        Response::redirect('/');
    }

    public static function notFoundRoute(RouteContext $ctx): never
    {
        Response::page('not-found.html', 404);
    }

    /**
     * The bare /customer-dashboard.html style URLs. Express served these
     * without a session check and let the client-side guard in js/auth.js
     * bounce unauthenticated visitors, so they stay unguarded here too.
     */
    public static function customerShell(RouteContext $ctx): never
    {
        Response::page('customer-dashboard.html');
    }

    public static function ownerShell(RouteContext $ctx): never
    {
        Response::page('owner-dashboard.html');
    }

    public static function staffShell(RouteContext $ctx): never
    {
        Response::page('staff-dashboard.html');
    }

    /** GET /dashboard/<role> — requires a session and serves that role's shell. */
    public static function dashboard(RouteContext $ctx): never
    {
        Auth::requirePageRole($ctx);
        Response::page(self::shellFor((string) $ctx->user['role']));
    }

    /**
     * GET /dashboard/<role>/profile — the dashboards are single-page apps, so
     * every section is a hash on the same shell.
     */
    public static function profileSection(RouteContext $ctx): never
    {
        Auth::requirePageRole($ctx);
        Response::redirect(self::shellUrl((string) $ctx->user['role']) . '#profile');
    }

    /**
     * GET /dashboard/<role>/<section> — validated against the per-role section
     * list, so an unknown section falls back to the dashboard root instead of
     * rendering an empty workspace.
     */
    public static function section(RouteContext $ctx): never
    {
        Auth::requirePageRole($ctx);

        $role    = (string) $ctx->user['role'];
        $section = $ctx->param('section');

        if (!in_array($section, AQ_ROLE_SECTIONS[$role] ?? [], true)) {
            Response::redirect(AQ_ROLE_LANDING[$role] ?? '/customer-dashboard.html');
        }

        Response::redirect(self::shellUrl($role) . '#' . $section);
    }

    private static function shellFor(string $role): string
    {
        return match ($role) {
            'owner' => 'owner-dashboard.html',
            'staff' => 'staff-dashboard.html',
            default => 'customer-dashboard.html',
        };
    }

    private static function shellUrl(string $role): string
    {
        return '/' . self::shellFor($role);
    }
}