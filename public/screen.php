<?php
declare(strict_types=1);
$id = (int)($_GET['id'] ?? 0);
if ($id < 1 || $id > 4) { http_response_code(404); exit('нет такого экрана'); }
?>
<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МОККО · экран <?= $id ?></title>
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<link rel="stylesheet" href="/assets/css/screen.css">
</head>
<body data-screen="<?= $id ?>">
<div id="fit"><div id="stage">
    <div id="vitrine" class="vitrine">
        <video id="vid-a" muted playsinline preload="auto"></video>
        <video id="vid-b" muted playsinline preload="auto"></video>
        <div id="poster" class="poster"></div>
        <div class="scrim"></div>
    </div>
    <header class="tvhead">
        <img class="logomark" src="/assets/img/logo.jpg" alt="" onerror="this.hidden=true">
        <span class="logo" id="brand">МОККО</span>
        <span class="scr" id="title"></span>
        <span class="clock" id="clock"></span>
    </header>
    <main class="menu" id="menu"></main>
</div></div>
<script src="/assets/js/player.js"></script>
<script src="/assets/js/screen.js"></script>
</body></html>
