<?php
declare(strict_types=1);
require_once __DIR__ . '/helpers.php';

function make_save_sandbox(): string {
    $dir = sys_get_temp_dir() . '/mokko-save-' . getmypid() . '-' . random_int(1000, 9999);
    mkdir($dir, 0777, true);
    foreach (['settings.json', 'screen-1.json'] as $f) copy("/var/www/data/$f", "$dir/$f");
    return $dir;
}

function test_save_requires_auth(): void {
    [$proc, $base] = start_server(make_save_sandbox());
    $r = http('POST', "$base/api/save.php", ['body' => '{}', 'headers' => ['Content-Type: application/json']]);
    check_eq($r['status'], 403, 'save без сессии → 403');
    proc_terminate($proc);
}

function test_save_flow(): void {
    $dir = make_save_sandbox();
    [$proc, $base] = start_server($dir);
    [$cookie, $csrf] = login_and_csrf($base, 'mokko2026');
    check($csrf !== '', 'получен csrf');

    $menu = json_decode((string)file_get_contents("$dir/screen-1.json"), true);
    $origMedia = $menu['media'];
    $menu['categories'][0]['items'][0]['prices'] = [140];
    $menu['media'] = ['videos' => ['hack.mp4'], 'poster' => 'hack.jpg']; // должно быть проигнорировано

    $r = http('POST', "$base/api/save.php", [
        'headers' => ["Cookie: $cookie", "X-CSRF-Token: $csrf", 'Content-Type: application/json'],
        'body' => json_encode($menu, JSON_UNESCAPED_UNICODE),
    ]);
    check_eq($r['status'], 200, 'save 200');
    $saved = json_decode((string)file_get_contents("$dir/screen-1.json"), true);
    check_eq($saved['categories'][0]['items'][0]['prices'], [140], 'цена сохранена');
    check_eq($saved['media'], $origMedia, 'media не затёрта клиентом');
    check($saved['updated_at'] !== $menu['updated_at'], 'updated_at обновлён сервером');

    $bad = $menu; $bad['screen'] = 7;
    $r = http('POST', "$base/api/save.php", [
        'headers' => ["Cookie: $cookie", "X-CSRF-Token: $csrf", 'Content-Type: application/json'],
        'body' => json_encode($bad),
    ]);
    check_eq($r['status'], 422, 'невалидный экран → 422');

    $r = http('POST', "$base/api/save.php", [
        'headers' => ["Cookie: $cookie", 'X-CSRF-Token: wrong', 'Content-Type: application/json'],
        'body' => json_encode($menu, JSON_UNESCAPED_UNICODE),
    ]);
    check_eq($r['status'], 403, 'неверный csrf → 403');
    proc_terminate($proc);
}
