<?php
// Serve real files from frontend/ (css, js, assets); everything else goes to the PHP router.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . '/frontend' . $path;
if ($path !== '/' && is_file($file)) {
    return false;
}
require __DIR__ . '/php-backend/api/index.php';
