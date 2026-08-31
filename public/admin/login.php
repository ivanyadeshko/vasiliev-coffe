<?php
declare(strict_types=1);
require __DIR__ . '/../../lib/auth.php';
auth_boot();
if (is_admin()) { header('Location: /admin/'); exit; }
$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (try_login((string)($_POST['password'] ?? ''))) { header('Location: /admin/'); exit; }
    $error = 'Неверный пароль';
}
?>
<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МОККО · вход</title>
<link rel="stylesheet" href="/assets/css/admin.css"></head>
<body class="login-page">
<form method="post" class="login-box">
    <h1>МОККО · админка</h1>
    <?php if ($error): ?><p class="err"><?= htmlspecialchars($error) ?></p><?php endif; ?>
    <input type="password" name="password" placeholder="Пароль" autofocus required>
    <button type="submit">Войти</button>
</form>
</body></html>
