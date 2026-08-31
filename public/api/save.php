<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/storage.php';
require_once __DIR__ . '/../../lib/auth.php';
require_once __DIR__ . '/../../lib/validate.php';

header('Content-Type: application/json; charset=utf-8');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(405); echo '{"error":"только POST"}'; exit; }
require_admin_api();
check_csrf();

$body = json_decode((string)file_get_contents('php://input'), true);
$errors = validate_screen($body);
if ($errors !== []) { http_response_code(422); echo json_encode(['errors' => $errors], JSON_UNESCAPED_UNICODE); exit; }

$file = 'screen-' . $body['screen'] . '.json';
$current = load_json_with_fallback($file);
$body['media'] = $current['media'] ?? ['videos' => [], 'poster' => ''];
$body['updated_at'] = date('c');
save_json_atomic($file, $body);
echo json_encode(['ok' => true, 'updated_at' => $body['updated_at']], JSON_UNESCAPED_UNICODE);
