<?php
declare(strict_types=1);

function http(string $method, string $url, array $opts = []): array {
    $ctx = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $opts['headers'] ?? []),
        'content' => $opts['body'] ?? null,
        'ignore_errors' => true,
        'follow_location' => 0,
        'timeout' => 5,
    ]]);
    $body = (string)@file_get_contents($url, false, $ctx);
    $status = 0; $headers = [];
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#^HTTP/\S+ (\d+)#', $h, $m)) { $status = (int)$m[1]; }
        elseif (str_contains($h, ':')) { [$k, $v] = explode(':', $h, 2); $headers[strtolower(trim($k))] = trim($v); }
    }
    return ['status' => $status, 'headers' => $headers, 'body' => $body];
}

function start_server(string $dataDir): array {
    // свободный порт: иначе два тестовых сервера в одном прогоне могут столкнуться
    do {
        $port = 8901 + random_int(0, 900);
        $busy = @fsockopen('127.0.0.1', $port, $ec, $em, 0.05);
        if ($busy) fclose($busy);
    } while ($busy);
    $cmd = 'MOKKO_DATA_DIR=' . escapeshellarg($dataDir) . ' php -S 127.0.0.1:' . $port . ' -t /var/www/html';
    $proc = proc_open($cmd, [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
    for ($i = 0; $i < 50; $i++) {
        usleep(100000);
        $c = @fsockopen('127.0.0.1', $port);
        if ($c) { fclose($c); break; }
    }
    return [$proc, "http://127.0.0.1:$port"];
}

function login_and_csrf(string $base, string $password): array {
    $r = http('POST', "$base/admin/login.php", [
        'headers' => ['Content-Type: application/x-www-form-urlencoded'],
        'body' => 'password=' . urlencode($password),
    ]);
    $cookie = explode(';', $r['headers']['set-cookie'] ?? '')[0];
    // CSRF-токен отдаёт мини-эндпоинт /admin/token.php:
    // страница-редактор появляется позже, а токен нужен тестам уже сейчас.
    $r2 = http('GET', "$base/admin/token.php", ['headers' => ["Cookie: $cookie"]]);
    $csrf = trim($r2['body']);
    return [$cookie, $csrf];
}
