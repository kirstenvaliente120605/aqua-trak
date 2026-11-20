<?php
/**
 * AquaTracker database configuration (Apache + PHP + MySQL).
 *
 * SETUP: open http://localhost:8080/install to create the database and tables.
 *
 * XAMPP's local MariaDB uses localhost:3306 and an empty root password by
 * default. Set AQ_DB_PASS here if the local root account has been secured.
 */

declare(strict_types=1);

const AQ_DB_HOST = 'localhost';
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
    'admin' => '/',
];
