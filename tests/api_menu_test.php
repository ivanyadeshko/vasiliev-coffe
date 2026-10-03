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

function test_api_menu_manifest(): void {
    // свой ролик-фикстура: mp4 в репозиторий не коммитятся
    $dir = sys_get_temp_dir() . '/mokko-manifest-' . getmypid() . '-' . random_int(1000, 9999);
    mkdir($dir, 0777, true);
    copy('/var/www/data/settings.json', "$dir/settings.json");
    $name = 'test-fixture-' . getmypid() . '.mp4';
    $video = "/var/www/html/assets/video/$name";
    file_put_contents($video, str_repeat('x', 1234));
    $menu = json_decode((string)file_get_contents('/var/www/data/screen-1.json'), true);
    $menu['media'] = ['poster' => '', 'videos' => [],
        'scenes' => [['videos' => [$name, 'no-such-clip.mp4'], 'intro' => 1, 'loops' => 5]]];
    file_put_contents("$dir/screen-1.json", json_encode($menu, JSON_UNESCAPED_UNICODE));
    [$proc, $base] = start_server($dir);
    $j = json_decode(http('GET', "$base/api/menu.php?screen=1")['body'], true);
    $files = $j['menu']['media']['files'] ?? null;
    check_eq($files[$name]['size'] ?? null, 1234, 'media.files: size = размер файла');
    check(is_int($files[$name]['v'] ?? null), 'media.files: v — версия файла');
    check(!isset($files['no-such-clip.mp4']), 'media.files: отсутствующего файла нет в манифесте');
    proc_terminate($proc);
    unlink($video);
}

function test_api_menu_build(): void {
    // версия кода экрана: изменился JS/CSS/страница — экраны перезагрузятся
    [$proc, $base] = start_server('/var/www/data');
    $r = http('GET', "$base/api/menu.php?screen=1");
    $build = json_decode($r['body'], true)['build'] ?? '';
    check(is_string($build) && preg_match('/^[0-9a-f]{12}$/', $build) === 1, 'build — хеш кода экрана');
    $page = http('GET', "$base/screen.php?id=1")['body'];
    check(str_contains($page, 'data-build="' . $build . '"'), 'screen.php знает свой build');

    $fixture = '/var/www/html/assets/js/test-fixture-' . getmypid() . '.js';
    file_put_contents($fixture, '// ' . random_int(0, PHP_INT_MAX));
    $r2 = http('GET', "$base/api/menu.php?screen=1", ['headers' => ['If-None-Match: ' . $r['headers']['etag']]]);
    unlink($fixture);
    check_eq($r2['status'], 200, 'новый код — не 304: ETag учитывает build');
    $build2 = json_decode($r2['body'], true)['build'] ?? '';
    check($build2 !== '' && $build2 !== $build, 'build меняется вместе с кодом');
    proc_terminate($proc);
}
