<?php
/**
 * AquaTracker front controller (XAMPP: Apache + PHP + MySQL).
 *
 * Every /api/* and page request is rewritten to this file by .htaccess, so the
 * frontend can keep calling the same root-relative URLs it uses against the
 * Node backend.
 */

declare(strict_types=1);

namespace AquaTracker;

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/src/Database.php';
require_once __DIR__ . '/src/Http.php';
require_once __DIR__ . '/src/Router.php';
require_once __DIR__ . '/src/Auth.php';
require_once __DIR__ . '/src/Controllers/AuthController.php';
require_once __DIR__ . '/src/Controllers/CommerceController.php';
require_once __DIR__ . '/src/Controllers/ErdController.php';
require_once __DIR__ . '/src/Controllers/StaffController.php';
require_once __DIR__ . '/src/Controllers/OwnerController.php';
require_once __DIR__ . '/src/Controllers/PageController.php';

$router = new Router();

// ---------------------------------------------------------------------------
// Static pages and the legacy index path
// ---------------------------------------------------------------------------
$router->get('/',            [PageController::class, 'landing']);
$router->get('/client/index.html', [PageController::class, 'legacyIndex']);
$router->get('/404',         [PageController::class, 'notFoundRoute']);

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
$router->get('/auth/logout', [AuthController::class, 'logoutGet']);
$router->post('/auth/logout', [AuthController::class, 'logoutPost']);
$router->post('/auth/login', [AuthController::class, 'loginJson']);
$router->get('/auth/:role/:mode',  [AuthController::class, 'formPage']);
$router->post('/auth/:role/:mode', [AuthController::class, 'submitForm']);
$router->get('/api/auth/me', [AuthController::class, 'me']);
$router->patch('/api/profile', [AuthController::class, 'updateProfile'], [[Auth::class, 'requireAuth']]);
$router->post('/api/profile/password', [AuthController::class, 'changePassword'], [[Auth::class, 'requireAuth']]);
$router->patch('/api/profile/address', [ErdController::class, 'updateAddress'], [Auth::requireRole('customer')]);

// ---------------------------------------------------------------------------
// Customer: stations, orders, subscriptions
// ---------------------------------------------------------------------------
/** Middleware factory: restricts a route to one role. */
$requireRole = static fn (string $role): callable => Auth::requireRole($role);

$router->get('/api/stations', [ErdController::class, 'stations'], [$requireRole('customer')]);

$router->get('/api/orders',  [ErdController::class, 'listOrders'],  [$requireRole('customer')]);
$router->post('/api/orders', [ErdController::class, 'createOrder'], [$requireRole('customer')]);
$router->patch('/api/orders/:id/status', [ErdController::class, 'updateOrderStatus'], [$requireRole('customer')]);

$router->get('/api/subscriptions', [ErdController::class, 'listSubscriptions'], [$requireRole('customer')]);
$router->post('/api/subscriptions', [ErdController::class, 'createSubscription'], [$requireRole('customer')]);
$router->post('/api/subscriptions/:id/cancel', [ErdController::class, 'cancelSubscription'], [$requireRole('customer')]);
$router->patch('/api/subscriptions/:id/status', [ErdController::class, 'updateSubscriptionStatus'], [$requireRole('customer')]);

$router->get('/api/loyalty', [ErdController::class, 'loyalty'], [$requireRole('customer')]);
$router->post('/api/rewards/redeem', [ErdController::class, 'redeemReward'], [$requireRole('customer')]);

$router->get('/api/notifications', [ErdController::class, 'listNotifications'], [$requireRole('customer')]);
$router->post('/api/notifications', [ErdController::class, 'createNotification'], [$requireRole('customer')]);
$router->patch('/api/notifications/read-all', [ErdController::class, 'markNotificationsRead'], [$requireRole('customer')]);

// ---------------------------------------------------------------------------
// Owner: staff approvals and station management
// ---------------------------------------------------------------------------

$router->get('/api/staff-approvals', [AuthController::class, 'listApprovals'], [$requireRole('owner')]);
$router->post('/api/staff-approvals/:id', [AuthController::class, 'decideApproval'], [$requireRole('owner')]);

$router->get('/api/owner/overview',  [OwnerController::class, 'overview'],  [$requireRole('owner')]);
$router->get('/api/owner/stations', [OwnerController::class, 'listStations'], [$requireRole('owner')]);
$router->post('/api/owner/stations', [OwnerController::class, 'createStation'], [$requireRole('owner')]);
$router->get('/api/owner/orders',    [OwnerController::class, 'listOrders'], [$requireRole('owner')]);
$router->get('/api/owner/customers', [OwnerController::class, 'listCustomers'], [$requireRole('owner')]);
$router->get('/api/owner/pricing',   [OwnerController::class, 'getPricing'],   [$requireRole('owner')]);
$router->post('/api/owner/pricing',  [OwnerController::class, 'updatePricing'], [$requireRole('owner')]);
$router->get('/api/owner/settings',  [OwnerController::class, 'getSettings'],  [$requireRole('owner')]);
$router->post('/api/owner/settings', [OwnerController::class, 'updateSettings'], [$requireRole('owner')]);
$router->get('/api/owner/inventory', [OwnerController::class, 'getInventory'], [$requireRole('owner')]);
$router->get('/api/owner/staff',     [OwnerController::class, 'listStaff'],   [$requireRole('owner')]);
$router->get('/api/owner/subscriptions', [OwnerController::class, 'listSubscriptions'], [$requireRole('owner')]);
$router->get('/api/owner/promotions', [OwnerController::class, 'listPromotions'], [$requireRole('owner')]);
$router->post('/api/owner/promotions', [OwnerController::class, 'createPromotion'], [$requireRole('owner')]);
$router->patch('/api/owner/orders/:id', [OwnerController::class, 'updateOrder'], [$requireRole('owner')]);

// ---------------------------------------------------------------------------
// Staff workspace
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Staff workspace
// ---------------------------------------------------------------------------

$router->get('/api/staff/overview',    [StaffController::class, 'overview'],    [$requireRole('staff')]);
$router->get('/api/staff/orders',      [StaffController::class, 'listOrders'],  [$requireRole('staff')]);
$router->get('/api/staff/orders/:id',  [StaffController::class, 'showOrder'],   [$requireRole('staff')]);
$router->patch('/api/staff/orders/:id', [StaffController::class, 'updateOrder'], [$requireRole('staff')]);
$router->get('/api/staff/shifts',      [StaffController::class, 'listMyShifts'], [$requireRole('staff')]);
$router->post('/api/staff/shifts/:id/attendance', [StaffController::class, 'attendance'], [$requireRole('staff')]);
$router->get('/api/staff/inventory',   [StaffController::class, 'showInventory'], [$requireRole('staff')]);
$router->post('/api/staff/inventory/report', [StaffController::class, 'reportInventory'], [$requireRole('staff')]);
$router->get('/api/staff/requests',    [StaffController::class, 'showRequests'],  [$requireRole('staff')]);
$router->patch('/api/staff/requests/:id', [StaffController::class, 'updateRequest'], [$requireRole('staff')]);
$router->get('/api/staff/notifications', [StaffController::class, 'showNotifications'], [$requireRole('staff')]);
$router->patch('/api/staff/profile',  [StaffController::class, 'updateProfile'], [$requireRole('staff')]);

// ---------------------------------------------------------------------------
// Dashboards.
// Order matters: the literal /profile segment is registered before the
// catch-all :section, and both before the bare /dashboard/:role.
// ---------------------------------------------------------------------------
$router->get('/customer-dashboard.html', [PageController::class, 'customerShell']);
$router->get('/owner-dashboard.html',    [PageController::class, 'ownerShell']);
$router->get('/staff-dashboard.html',    [PageController::class, 'staffShell']);

// The dashboard routes reuse one guard. It has to be wrapped in an array:
// the third argument is the list of middlewares, not a single callable, so a
// bare [Class::class, 'method'] pair would be iterated as two separate
// middleware entries and the class name string would be called as a function.
$pageRole = [Auth::class, 'requirePageRole'];

$router->get('/dashboard/:role/profile',  [PageController::class, 'profileSection'], [$pageRole]);
$router->get('/dashboard/:role/:section', [PageController::class, 'section'],        [$pageRole]);
$router->get('/dashboard/:role',           [PageController::class, 'dashboard'],     [$pageRole]);

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
// CORS for frontend origins (dev 8080, XAMPP 8080)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PATCH, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }

try {
    $router->dispatch(Request::capture());
} catch (\Throwable $e) {
    // Serve the frontend's own error shell so a PHP fault looks the same as it
    // did under Express, but keep the detail in the Apache error log.
    Response::serverError($e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
}
