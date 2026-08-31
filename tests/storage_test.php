<?php
declare(strict_types=1);
putenv('MOKKO_DATA_DIR=' . sys_get_temp_dir() . '/mokko-test-' . getmypid());
require_once __DIR__ . '/../lib/storage.php';

function test_storage_roundtrip(): void {
    @mkdir(data_dir(), 0777, true);
    save_json_atomic('t.json', ['a' => 'ёлка', 'n' => 5]);
    check_eq(load_json('t.json'), ['a' => 'ёлка', 'n' => 5], 'roundtrip');
    check(str_contains((string)file_get_contents(data_dir() . '/t.json'), 'ёлка'), 'unescaped unicode');
}
function test_storage_missing_and_broken(): void {
    check_eq(load_json('nope.json'), null, 'нет файла → null');
    file_put_contents(data_dir() . '/bad.json', '{oops');
    check_eq(load_json('bad.json'), null, 'битый json → null');
}
function test_storage_backups_and_fallback(): void {
    for ($i = 1; $i <= 13; $i++) save_json_atomic('b.json', ['v' => $i]);
    $baks = glob(data_dir() . '/backups/b.json.*.bak');
    check_eq(count($baks), 10, 'ротация держит ровно 10 бэкапов');
    file_put_contents(data_dir() . '/b.json', '{broken');
    $fb = load_json_with_fallback('b.json');
    check($fb !== null && $fb['v'] >= 11, 'фолбэк на свежий бэкап');
}
function test_storage_etag(): void {
    save_json_atomic('e.json', ['x' => 1]);
    $e1 = etag_for('e.json');
    check(preg_match('/^"[0-9a-f]{32}"$/', $e1) === 1, 'формат etag');
    save_json_atomic('e.json', ['x' => 2]);
    check($e1 !== etag_for('e.json'), 'etag меняется');
    check_eq(etag_for('e.json'), etag_for('e.json'), 'etag стабилен');
}
