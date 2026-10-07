<?php
/**
 * Express-flavoured router: literal segments plus ":name" placeholders, with
 * per-route middleware chains. Routes are matched in registration order, so
 * more specific patterns must be registered before the ones they shadow
 * (e.g. /dashboard/:role/profile before /dashboard/:role/:section).
 */

declare(strict_types=1);

namespace AquaTracker;

final class Router
{
    /** @var list<array{method:string,regex:string,names:list<string>,handler:callable,middleware:list<callable>}> */
    private array $routes = [];

    public function get(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('GET', $pattern, $handler, $middleware);
    }

    public function post(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('POST', $pattern, $handler, $middleware);
    }

    public function patch(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('PATCH', $pattern, $handler, $middleware);
    }

    public function put(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('PUT', $pattern, $handler, $middleware);
    }

    public function delete(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('DELETE', $pattern, $handler, $middleware);
    }

    /** @param array<string,string> $params */
    public function dispatch(Request $request): void
    {
        $method = $request->method === 'HEAD' ? 'GET' : $request->method;

        foreach ($this->routes as $route) {
            if ($route['method'] !== $method) {
                continue;
            }
            if (!preg_match($route['regex'], $request->path, $matches)) {
                continue;
            }

            $params = [];
            foreach ($route['names'] as $index => $name) {
                $params[$name] = urldecode($matches[$index + 1] ?? '');
            }

            $context = new RouteContext($request, $params);

            foreach ($route['middleware'] as $middleware) {
                $middleware($context);
            }

            $handler = $route['handler'];
            $handler($context);
            return;
        }

        Response::notFound();
    }

    private function add(string $method, string $pattern, callable $handler, array $middleware): void
    {
        // Swap ":name" for an alphanumeric token BEFORE quoting. preg_quote()
        // escapes ":", so trying to match placeholders afterwards would not
        // work, and a token of plain word characters passes through untouched.
        $names = [];
        $tokenized = preg_replace_callback(
            '/:([A-Za-z_][A-Za-z0-9_]*)/',
            static function (array $m) use (&$names): string {
                $names[] = $m[1];
                return '__AQPARAM' . count($names) . '__';
            },
            $pattern
        );

        $regex = preg_quote((string) $tokenized, '#');
        $regex = preg_replace_callback('/__AQPARAM\d+__/', static fn (): string => '([^/]+)', $regex);

        $this->routes[] = [
            'method'     => $method,
            'regex'      => '#^' . $regex . '$#',
            'names'      => $names,
            'handler'    => $handler,
            'middleware' => $middleware,
        ];
    }
}

/** Request plus the parameters pulled out of the matched route. */
final class RouteContext
{
    public array $user = [];

    /** @param array<string,string> $params */
    public function __construct(
        public readonly Request $request,
        public readonly array $params,
    ) {
    }

    public function param(string $name, string $default = ''): string
    {
        return $this->params[$name] ?? $default;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->request->input($key, $default);
    }

    public function str(string $key, string $default = ''): string
    {
        return $this->request->str($key, $default);
    }
}