<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . '/frontend' . $path;

if ($path !== '/' && is_file($file)) {
    $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $mimeTypes = [
        'css' => 'text/css',
        'js' => 'application/javascript',
        'png' => 'image/png',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'svg' => 'image/svg+xml',
        'webp' => 'image/webp',
        'ico' => 'image/x-icon',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2'
    ];

    if (isset($mimeTypes[$extension])) {
        header('Content-Type: ' . $mimeTypes[$extension]);
    }

    readfile($file);
    exit;
}

if ($path === '/') {
    readfile(__DIR__ . '/frontend/index.html');
    exit;
}

require __DIR__ . '/backend/api/index.php';
