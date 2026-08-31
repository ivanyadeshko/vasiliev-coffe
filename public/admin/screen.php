<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/storage.php';
require_admin_page();
$id = (int)($_GET['id'] ?? 0);
if ($id < 1 || $id > 4) { http_response_code(404); exit('нет такого экрана'); }
$data = load_json_with_fallback("screen-$id.json");
if ($data === null) { http_response_code(500); exit('данные не читаются'); }
$json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
?>
<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МОККО · <?= htmlspecialchars($data['title']) ?></title>
<link rel="stylesheet" href="/assets/css/admin.css"></head>
<body class="admin">
<header class="topbar">
    <a href="/admin/">← экраны</a>
    <b><?= htmlspecialchars($data['title']) ?></b>
    <a href="/screen.php?id=<?= $id ?>" target="_blank">посмотреть экран ↗</a>
</header>
<main id="editor"></main>
<footer class="savebar">
    <span id="msg"></span>
    <button id="save" type="button">Сохранить</button>
</footer>
<script>
window.SCREEN_DATA = <?= $json ?>;
window.CSRF = <?= json_encode(csrf_token()) ?>;
</script>
<script src="/assets/js/admin.js"></script>
</body></html>
