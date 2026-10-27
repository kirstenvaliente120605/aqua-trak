<?php
/**
 * AquaTracker database configuration (Apache + PHP + MySQL).
 *
 * SETUP: open http://localhost:8080/install to create the database and tables.
 *
 * The server is a standalone MySQL Server 26.7 instance started by
 * php-backend/start-aquatracker.bat and configured by
 * php-backend/mysql/my-aquatracker.ini. It is deliberately NOT XAMPP's bundled
 * MariaDB: that build (10.4.32) asserted at startup on this machine, and later
 * deadlocked inside InnoDB and killed itself, so it cannot host the database.
 * The header of my-aquatracker.ini has the full detail.
 *
 * Port 3306 (XAMPP standard) so this instance can never collide with
 * another MySQL or MariaDB server started later on the default port.
 *
 * The instance is initialised with an empty root password, which is why
 * AQ_DB_PASS is blank below. Set it here if you ever give root a password.
 */

declare(strict_types=1);

const AQ_DB_HOST = '127.0.0.1';
const AQ_DB_PORT = 3306;
const AQ_DB_NAME = 'aquatracker';
const AQ_DB_USER = 'root';
const AQ_DB_PASS = ''; // set it here only if you give root a password later

/** Must match the cookie the frontend clears in js/auth.js logout(). */
const AQ_SESSION_COOKIE = 'aquatracker_session';

/** 7 days, matching SESSION_TTL_MS in the Node backend. */
const AQ_SESSION_TTL = 604800;

/** frontend/ is the Apache DocumentRoot; pages live in frontend/pages. */
const AQ_FRONTEND_DIR = __DIR__ . '/../../frontend';
const AQ_PAGES_DIR = AQ_FRONTEND_DIR . '/pages';

const AQ_ROLES = ['customer', 'owner', 'staff'];

/** Order lifecycle, mirrored from commerceStore.js orderStatuses. */
const AQ_ORDER_STATUSES = [
    'New',
    'Confirmed',
    'Preparing',
    'Ready for Pickup',
    'Out for Delivery',
    'Delivered',
    'Cancelled',
];

/**
 * Valid dashboard sections per role, mirrored from routes/index.js `sections`.
 * Used by GET /dashboard/:role/:section so unknown sections still redirect
 * somewhere sensible instead of 404ing.
 */
const AQ_ROLE_SECTIONS = [
    'customer' => [
        'find-stations',
        'order-water',
        'my-subscriptions',
        'orders-history',
        'rewards',
        'profile',
    ],
    'owner' => [
        'orders',
        'subscriptions',
        'customers',
        'staff-approvals',
        'promotions',
        'pricing',
        'station-settings',
        'profile',
    ],
    'staff' => [
        'my-shifts',
        'station-orders',
        'inventory',
        'customer-requests',
        'profile',
    ],
];

/** Which dashboard page each role lands on. */
const AQ_ROLE_LANDING = [
    'customer' => '/dashboard/customer',
    'owner' => '/dashboard/owner',
    'staff' => '/dashboard/staff',
];