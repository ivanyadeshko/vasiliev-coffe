<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';

function auth_boot(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
        session_start();
    }
}
function is_admin(): bool { auth_boot(); return ($_SESSION['admin'] ?? false) === true; }
function require_admin_page(): void {
    if (!is_admin()) { header('Location: /admin/login.php'); exit; }
}
function require_admin_api(): void {
    if (!is_admin()) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo '{"error":"нужен вход в админку"}'; exit;
    }
}
function try_login(string $password): bool {
    auth_boot();
    $s = load_json('settings.json') ?? [];
    $hash = (string)($s['admin_password_hash'] ?? '');
    if ($hash !== '' && password_verify($password, $hash)) {
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        return true;
    }
    sleep(1);
    return false;
}
function csrf_token(): string {
    auth_boot();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}
function check_csrf(): void {
    auth_boot();
    $t = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals($_SESSION['csrf'] ?? '', $t)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo '{"error":"csrf"}'; exit;
    }
}
