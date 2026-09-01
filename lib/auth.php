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
function client_ip(): string {
    // за nginx реальный адрес приходит в X-Real-IP (порт контейнера закрыт снаружи)
    return $_SERVER['HTTP_X_REAL_IP'] ?? ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

/**
 * Регистрирует попытку входа с IP. Не больше $limit попыток за $window секунд.
 * Возвращает [разрешено(bool), секунд до снятия блокировки(int)].
 */
function login_rate_register(string $ip, int $limit = 4, int $window = 600): array {
    $path = data_dir() . '/login-attempts.json';
    $now = time();
    $fh = fopen($path, 'c+');
    if ($fh === false) return [true, 0]; // не блокируем вход из-за ошибки ФС
    flock($fh, LOCK_EX);
    $all = json_decode((string)stream_get_contents($fh), true) ?: [];
    foreach ($all as $k => $ts) {
        $all[$k] = array_values(array_filter((array)$ts, fn($t) => $t > $now - $window));
        if ($all[$k] === []) unset($all[$k]);
    }
    $times = $all[$ip] ?? [];
    if (count($times) >= $limit) {
        flock($fh, LOCK_UN);
        fclose($fh);
        return [false, max(1, min($times) + $window - $now)];
    }
    $all[$ip][] = $now;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($all));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return [true, 0];
}

function login_rate_clear(string $ip): void {
    $path = data_dir() . '/login-attempts.json';
    $fh = @fopen($path, 'c+');
    if ($fh === false) return;
    flock($fh, LOCK_EX);
    $all = json_decode((string)stream_get_contents($fh), true) ?: [];
    unset($all[$ip]);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($all));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
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
