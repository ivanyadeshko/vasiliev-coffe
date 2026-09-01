<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/auth.php';
auth_boot();
if (is_admin()) { header('Location: /admin/'); exit; }
$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    [$allowed, $retry] = login_rate_register(client_ip());
    if (!$allowed) {
        http_response_code(429);
        $mins = (int)ceil($retry / 60);
        $error = "Слишком много попыток входа. Подождите ~{$mins} мин.";
    } elseif (try_login((string)($_POST['password'] ?? ''))) {
        login_rate_clear(client_ip());
        header('Location: /admin/');
        exit;
    } else {
        $error = 'Неверный пароль';
    }
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
