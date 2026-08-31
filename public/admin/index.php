<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/storage.php';
require_admin_page();
$screens = [];
for ($i = 1; $i <= 4; $i++) {
    $d = load_json_with_fallback("screen-$i.json");
    $count = 0;
    foreach (($d['categories'] ?? []) as $c) $count += count($c['items'] ?? []);
    $screens[$i] = ['title' => $d['title'] ?? "Экран $i", 'count' => $count, 'updated' => $d['updated_at'] ?? ''];
}
?>
<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МОККО · админка</title>
<link rel="stylesheet" href="/assets/css/admin.css"></head>
<body class="admin">
<header class="topbar">
    <b>МОККО · админка</b>
    <a href="/admin/logout.php">выйти</a>
</header>
<main class="cards">
<?php foreach ($screens as $i => $s): ?>
    <a class="scard" href="/admin/screen.php?id=<?= $i ?>">
        <span class="num"><?= $i ?></span>
        <b><?= htmlspecialchars($s['title']) ?></b>
        <span class="meta"><?= $s['count'] ?> позиций · обновлено <?= htmlspecialchars(substr($s['updated'], 0, 16)) ?></span>
    </a>
<?php endforeach; ?>
</main>
</body></html>
