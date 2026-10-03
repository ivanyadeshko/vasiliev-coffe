<?php
declare(strict_types=1);

// Версия кода экрана: хеш содержимого страницы, скриптов и стилей.
// Экран сверяет её при каждом опросе меню и перезагружается после деплоя.
// По содержимому, а не mtime: rsync/touch без правок не дёргают телевизоры.
function screen_build(string $publicDir): string {
    $files = array_merge(
        [$publicDir . '/screen.php', $publicDir . '/assets/fonts/fonts.css'],
        glob($publicDir . '/assets/js/*.js') ?: [],
        glob($publicDir . '/assets/css/*.css') ?: []
    );
    sort($files);
    $h = '';
    foreach ($files as $f) {
        if (is_file($f)) $h .= basename($f) . ':' . md5_file($f) . "\n";
    }
    return substr(md5($h), 0, 12);
}
