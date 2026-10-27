<?php
/**
 * Request/response plumbing. Keeps the controllers free of superglobals and
 * reproduces the status codes and JSON envelopes the frontend already expects.
 */

declare(strict_types=1);

namespace AquaTracker;

final class Request
{
    public readonly string $method;
    public readonly string $path;
    /** @var array<string,mixed> */
    public readonly array $query;
    /** @var array<string,mixed> */
    public readonly array $body;
    /** @var array<string,string> */
    public readonly array $cookies;

    private function __construct()
    {
        $this->method  = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $this->path    = self::resolvePath();
        $this->query   = $_GET;
        $this->cookies = array_map('strval', $_COOKIE);
        $this->body    = self::resolveBody();
    }

    public static function capture(): self
    {
        return new self();
    }

    /**
     * Apache runs this file as /api/index.php, so REQUEST_URI still carries the
     * /api prefix. Strip the script's own directory to get the route the
     * frontend actually asked for (e.g. "/orders" for /api/orders).
     */
    private static function resolvePath(): string
    {
        $uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')), '/');

        if ($base !== '' && $base !== '/' && str_starts_with($uri, $base)) {
            $uri = substr($uri, strlen($base));
        }

        $uri = '/' . ltrim($uri, '/');
        // Collapse a trailing slash so /api/orders/ matches /api/orders.
        return $uri === '/' ? '/' : rtrim($uri, '/');
    }

    /** @return array<string,mixed> */
    private static function resolveBody(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            // Native HTML form posts arrive as $_POST.
            return $_POST;
        }

        $type = $_SERVER['CONTENT_TYPE'] ?? '';
        if (str_contains($type, 'application/json')) {
            $decoded = json_decode($raw, true);
            return is_array($decoded) ? $decoded : [];
        }
        if (str_contains($type, 'application/x-www-form-urlencoded')) {
            parse_str($raw, $parsed);
            return $parsed;
        }

        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return $decoded;
        }

        return $_POST;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $this->query[$key] ?? $default;
    }

    public function str(string $key, string $default = ''): string
    {
        $value = $this->input($key, $default);
        return is_scalar($value) ? trim((string) $value) : $default;
    }

    public function cookie(string $name): ?string
    {
        return $this->cookies[$name] ?? null;
    }
}

final class Response
{
    /** @param array<string,mixed>|list<mixed> $data */
    public static function json(array $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function fail(string $error, int $status = 400): never
    {
        self::json(['error' => $error], $status);
    }

    public static function redirect(string $location, int $status = 302): never
    {
        http_response_code($status);
        header('Location: ' . $location);
        exit;
    }

    /** Sends one of the static pages from frontend/pages. */
    public static function page(string $file, int $status = 200): never
    {
        $full = AQ_PAGES_DIR . DIRECTORY_SEPARATOR . basename($file);

        if (!is_file($full)) {
            self::fail('Page not found: ' . $file, 500);
        }

        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        readfile($full);
        exit;
    }

    /**
     * The 404 and 500 shells. Matches the Node backend's behaviour of serving
     * not-found.html / error.html from the frontend rather than Apache's
     * default pages.
     */
    public static function notFound(): never
    {
        self::page('not-found.html', 404);
    }

    public static function serverError(string $detail = ''): never
    {
        if ($detail !== '') {
            error_log('[aquatracker] ' . $detail);
        }
        self::page('error.html', 500);
    }
}