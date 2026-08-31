<?php
declare(strict_types=1);
require_once __DIR__ . '/helpers.php';

function test_api_menu(): void {
    [$proc, $base] = start_server('/var/www/data');
    $r = http('GET', "$base/api/menu.php?screen=1");
    check_eq($r['status'], 200, 'menu 200');
    $j = json_decode($r['body'], true);
    check_eq($j['settings']['brand'] ?? null, 'МОККО', 'brand в ответе');
    check_eq($j['settings']['currency'] ?? null, '₽', 'currency в ответе');
    check_eq($j['menu']['screen'] ?? null, 1, 'menu.screen');
    check(($r['headers']['etag'] ?? '') !== '', 'есть ETag');
    check(str_contains($r['headers']['cache-control'] ?? '', 'no-store'), 'no-store');

    $r2 = http('GET', "$base/api/menu.php?screen=1", ['headers' => ['If-None-Match: ' . $r['headers']['etag']]]);
    check_eq($r2['status'], 304, '304 при совпадении etag');

    $r3 = http('GET', "$base/api/menu.php?screen=9");
    check_eq($r3['status'], 404, '404 для неверного экрана');
    proc_terminate($proc);
}
