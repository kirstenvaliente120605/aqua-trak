
<?php
// PHP built-in server router

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$uri = rawurldecode($uri);

// Serve existing frontend files directly.
$file = __DIR__ . '/frontend' . $uri;

if ($uri !== '/' && is_file($file)) {
    return false;
}

// Serve the homepage.
if ($uri === '/') {
    readfile(__DIR__ . '/frontend/index.html');
    exit;
}

// Forward other requests to the backend API.
$_SERVER['SCRIPT_NAME'] = '/backend/api/index.php';
$_SERVER['PHP_SELF'] = '/backend/api/index.php';

require __DIR__ . '/backend/api/index.php';
