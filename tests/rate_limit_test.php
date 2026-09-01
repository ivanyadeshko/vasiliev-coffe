<?php
declare(strict_types=1);
require_once __DIR__ . '/helpers.php';

function make_login_sandbox(): string {
    $dir = sys_get_temp_dir() . '/mokko-rate-' . getmypid() . '-' . random_int(1000, 9999);
    mkdir($dir, 0777, true);
    copy('/var/www/data/settings.json', "$dir/settings.json");
    return $dir;
}

function post_login(string $base, string $password): array {
    return http('POST', "$base/admin/login.php", [
        'headers' => ['Content-Type: application/x-www-form-urlencoded'],
        'body' => 'password=' . urlencode($password),
    ]);
}

function test_login_rate_limit(): void {
    [$proc, $base] = start_server(make_login_sandbox());
    for ($i = 1; $i <= 4; $i++) {
        $r = post_login($base, 'неверный');
        check_eq($r['status'], 200, "попытка $i ещё разрешена");
        check(str_contains($r['body'], 'Неверный пароль'), "попытка $i: обычная ошибка");
    }
    $r = post_login($base, 'неверный');
    check_eq($r['status'], 429, '5-я попытка за 10 минут заблокирована');
    check(str_contains($r['body'], 'Слишком много попыток'), 'сообщение о блокировке');
    $r = post_login($base, 'mokko2026');
    check_eq($r['status'], 429, 'в блоке не пускает даже верный пароль');
    proc_terminate($proc);
}

function test_login_rate_reset_on_success(): void {
    [$proc, $base] = start_server(make_login_sandbox());
    post_login($base, 'неверный');
    post_login($base, 'неверный');
    $r = post_login($base, 'mokko2026');
    check_eq($r['status'], 302, 'верный пароль в пределах лимита пускает');
    // после успешного входа счётчик сброшен: снова доступны 4 попытки
    for ($i = 1; $i <= 4; $i++) $r = post_login($base, 'неверный');
    check_eq($r['status'], 200, 'после сброса лимит отсчитывается заново');
    proc_terminate($proc);
}
