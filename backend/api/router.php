<?php
// PHP built-in server router (php -S) — forwards non-file requests to index.php
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = __DIR__ . $uri;
if (is_file($path)) {
    return false; // serve file directly (css/js/images)
}
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['PHP_SELF'] = '/index.php';
require __DIR__ . '/index.php';
