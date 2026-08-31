<?php
declare(strict_types=1);
require_once __DIR__ . '/helpers.php';

function test_auth_flow(): void {
    [$proc, $base] = start_server('/var/www/data');

    $r = http('GET', "$base/admin/login.php");
    check_eq($r['status'], 200, 'страница логина открывается');

    $r = http('POST', "$base/admin/login.php", [
        'headers' => ['Content-Type: application/x-www-form-urlencoded'],
        'body' => 'password=' . urlencode('неверный'),
    ]);
    check(str_contains($r['body'], 'Неверный пароль'), 'ошибка при неверном пароле');

    $r = http('POST', "$base/admin/login.php", [
        'headers' => ['Content-Type: application/x-www-form-urlencoded'],
        'body' => 'password=mokko2026',
    ]);
    check_eq($r['status'], 302, 'redirect после входа');
    $cookie = explode(';', $r['headers']['set-cookie'] ?? '')[0];
    check($cookie !== '', 'выдана cookie сессии');
    proc_terminate($proc);
}
