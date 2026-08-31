<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/storage.php';
$pw = $argv[1] ?? '';
if ($pw === '') { fwrite(STDERR, "использование: php bin/set-password.php <пароль>\n"); exit(1); }
$s = load_json('settings.json') ?? [];
$s['admin_password_hash'] = password_hash($pw, PASSWORD_DEFAULT);
save_json_atomic('settings.json', $s);
echo "пароль обновлён\n";
