<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/storage.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$id = (int)($_GET['screen'] ?? 0);
if ($id < 1 || $id > 4) { http_response_code(404); echo '{"error":"screen: 1..4"}'; exit; }

$menuFile = "screen-$id.json";
$etag = etag_for($menuFile, 'settings.json');
header("ETag: $etag");
if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }

$menu = load_json_with_fallback($menuFile);
$settings = load_json('settings.json') ?? [];
if ($menu === null) { http_response_code(500); echo '{"error":"данные недоступны"}'; exit; }

echo json_encode([
    'settings' => [
        'brand' => $settings['brand'] ?? 'МОККО',
        'currency' => $settings['currency'] ?? '₽',
        'poll_seconds' => (int)($settings['poll_seconds'] ?? 60),
        'reload_at' => $settings['reload_at'] ?? '04:00',
    ],
    'menu' => $menu,
], JSON_UNESCAPED_UNICODE);
