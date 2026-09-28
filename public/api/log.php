<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/storage.php';
require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/logs.php';

// Приём событий с экранов. Без авторизации: экраны не залогинены,
// поэтому всё входящее жёстко ограничивается в log_normalize_entry().
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); echo '{"error":"только POST"}'; exit; }

$raw = (string)file_get_contents('php://input', false, null, 0, 32 * 1024 + 1);
if (strlen($raw) > 32 * 1024) { http_response_code(413); echo '{"error":"слишком большое тело"}'; exit; }
$body = json_decode($raw, true);
if (!is_array($body) || !is_array($body['entries'] ?? null)) { http_response_code(400); echo '{"error":"нужен {entries:[...]}"}'; exit; }

log_append($body['entries'], client_ip());
if (random_int(1, 50) === 1) log_cleanup();
http_response_code(204);
