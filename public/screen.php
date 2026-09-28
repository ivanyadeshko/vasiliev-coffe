<?php
declare(strict_types=1);
$id = (int)($_GET['id'] ?? 0);
if ($id < 1 || $id > 4) { http_response_code(404); exit('нет такого экрана'); }
// ?v=mtime: после деплоя ТВ не соберёт новую страницу со старыми скриптами из кэша
function asset(string $path): string {
    return $path . '?v=' . (int)@filemtime(__DIR__ . $path);
}
?>
<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МОККО · экран <?= $id ?></title>
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<link rel="stylesheet" href="<?= asset('/assets/css/screen.css') ?>">
</head>
<body data-screen="<?= $id ?>">
<div id="fit"><div id="stage">
    <div id="vitrine" class="vitrine">
        <video id="vid-a" muted playsinline preload="auto"></video>
        <video id="vid-b" muted playsinline preload="auto"></video>
        <div id="poster" class="poster"></div>
        <div class="scrim"></div>
    </div>
    <div id="loader" class="loader" hidden>
        <svg class="emblem" viewBox="0 0 220 220" aria-hidden="true">
            <circle class="ring-track" cx="104" cy="138" r="64" pathLength="100"/>
            <circle class="ring" id="loader-ring" cx="104" cy="138" r="64" pathLength="100"/>
            <path class="draw handle" pathLength="100" d="M152 128 h20 a10 10 0 0 1 0 20 h-20"/>
            <circle class="draw cup" cx="104" cy="138" r="50" pathLength="100"/>
            <circle class="coffee" cx="104" cy="138" r="38"/>
            <path class="draw em" pathLength="100" d="M40 84 L56 34 L74 66 L92 34 L106 84"/>
            <path class="steam s1" pathLength="100" d="M122 106 C116 94 128 86 123 72 C118 60 132 52 128 38"/>
            <path class="steam s2" pathLength="100" d="M138 108 C132 96 144 88 139 76 C135 66 148 58 144 46"/>
            <path class="steam s3" pathLength="100" d="M154 112 C149 101 160 94 156 83 C152 74 164 67 161 58"/>
        </svg>
        <div class="wordmark" id="loader-brand">МОККО</div>
        <div class="caption" id="loader-caption">Загружаем видео</div>
    </div>
    <header class="tvhead">
        <img class="logomark" src="/assets/img/logo.jpg" alt="" onerror="this.hidden=true">
        <span class="logo" id="brand">МОККО</span>
        <span class="scr" id="title"></span>
        <span class="clock" id="clock"></span>
    </header>
    <main class="menu" id="menu"></main>
</div></div>
<script src="<?= asset('/assets/js/log.js') ?>"></script>
<script src="<?= asset('/assets/js/media-cache.js') ?>"></script>
<script src="<?= asset('/assets/js/loader.js') ?>"></script>
<script src="<?= asset('/assets/js/player.js') ?>"></script>
<script src="<?= asset('/assets/js/screen.js') ?>"></script>
</body></html>
