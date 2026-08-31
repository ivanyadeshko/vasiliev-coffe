<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/validate.php';

function test_seed_files_valid(): void {
    $dir = '/var/www/data';
    for ($i = 1; $i <= 4; $i++) {
        $d = json_decode((string)@file_get_contents("$dir/screen-$i.json"), true);
        check(is_array($d), "screen-$i.json парсится");
        if (is_array($d)) {
            check_eq(validate_screen($d), [], "screen-$i.json валиден");
            check_eq($d['screen'], $i, "screen-$i.json: правильный номер");
        }
    }
    $s = json_decode((string)@file_get_contents("$dir/settings.json"), true);
    check(is_array($s), 'settings.json парсится');
    foreach (['brand', 'currency', 'poll_seconds', 'reload_at', 'admin_password_hash'] as $k)
        check(array_key_exists($k, $s ?? []), "settings.$k есть");
    check_eq($s['brand'] ?? '', 'МОККО', 'brand');
    check_eq($s['currency'] ?? '', '₽', 'currency');
}
