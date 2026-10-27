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
require_once __DIR__ . '/src/Database.php';
require_once __DIR__ . '/src/Http.php';
require_once __DIR__ . '/src/Router.php';
require_once __DIR__ . '/src/Auth.php';
require_once __DIR__ . '/src/Controllers/AuthController.php';
require_once __DIR__ . '/src/Controllers/CommerceController.php';
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

// ---------------------------------------------------------------------------
// Customer: stations, orders, subscriptions
// ---------------------------------------------------------------------------
/** Middleware factory: restricts a route to one role. */
$requireRole = static fn (string $role): callable => Auth::requireRole($role);

$router->get('/api/stations', [CommerceController::class, 'stations'], [$requireRole('customer')]);

$router->get('/api/orders',  [CommerceController::class, 'listOrders'],  [$requireRole('customer')]);
$router->post('/api/orders', [CommerceController::class, 'createOrder'], [$requireRole('customer')]);

$router->get('/api/subscriptions', [CommerceController::class, 'listSubscriptions'], [$requireRole('customer')]);
$router->get('/api/loyalty', [CommerceController::class, 'loyalty'], [$requireRole('customer')]);
$router->post('/api/loyalty', [CommerceController::class, 'addLoyalty'], [$requireRole('customer')]);
$router->get('/api/saved-stations', [CommerceController::class, 'savedStations'], [$requireRole('customer')]);
$router->post('/api/saved-stations', [CommerceController::class, 'saveStation'], [$requireRole('customer')]);

$router->post('/api/subscriptions', [CommerceController::class, 'createSubscription'], [$requireRole('customer')]);
$router->post('/api/subscriptions/:id/cancel', [CommerceController::class, 'cancelSubscription'], [$requireRole('customer')]);

// ---------------------------------------------------------------------------
// Owner: staff approvals and station management
// ---------------------------------------------------------------------------

$router->get('/api/staff-approvals', [AuthController::class, 'listApprovals'], [$requireRole('owner')]);
$router->post('/api/staff-approvals/:id', [AuthController::class, 'decideApproval'], [$requireRole('owner')]);

$router->get('/api/owner/overview',  [OwnerController::class, 'overview'],  [$requireRole('owner')]);
$router->get('/api/owner/orders',    [OwnerController::class, 'listOrders'], [$requireRole('owner')]);
$router->get('/api/owner/customers', [OwnerController::class, 'listCustomers'], [$requireRole('owner')]);
$router->get('/api/owner/pricing',   [OwnerController::class, 'getPricing'],   [$requireRole('owner')]);
$router->post('/api/owner/pricing',  [OwnerController::class, 'updatePricing'], [$requireRole('owner')]);
$router->get('/api/owner/settings',  [OwnerController::class, 'getSettings'],  [$requireRole('owner')]);
$router->post('/api/owner/settings', [OwnerController::class, 'updateSettings'], [$requireRole('owner')]);

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