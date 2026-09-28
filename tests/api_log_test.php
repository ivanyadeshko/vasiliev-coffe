<?php
declare(strict_types=1);
require_once __DIR__ . '/helpers.php';
require_once '/var/www/lib/logs.php';

function make_log_sandbox(): string {
    $dir = sys_get_temp_dir() . '/mokko-log-' . getmypid() . '-' . random_int(1000, 9999);
    mkdir($dir, 0777, true);
    return $dir;
}

function log_lines(string $dir): array {
    $files = glob("$dir/logs/screens-*.jsonl") ?: [];
    $out = [];
    foreach ($files as $f) {
        foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $l) $out[] = json_decode($l, true);
    }
    return $out;
}

function post_log(string $base, string $body): array {
    return http('POST', "$base/api/log.php", [
        'headers' => ['Content-Type: application/json'],
        'body' => $body,
    ]);
}

function test_api_log_writes_entries(): void {
    $dir = make_log_sandbox();
    [$proc, $base] = start_server($dir);
    $r = post_log($base, json_encode(['entries' => [
        ['ts' => '2026-09-28T10:00:00Z', 'screen' => 3, 'sid' => 'abc123', 'level' => 'error',
         'event' => 'player.error', 'data' => ['file' => 'screen-3-a1.mp4', 'code' => 3]],
        ['ts' => '2026-09-28T10:00:01Z', 'screen' => 3, 'sid' => 'abc123', 'level' => 'info',
         'event' => 'heartbeat', 'data' => ['state' => 'playing']],
    ]]));
    check_eq($r['status'], 204, 'log: валидная пачка → 204');
    $lines = log_lines($dir);
    check_eq(count($lines), 2, 'log: обе записи в файле');
    check_eq($lines[0]['event'] ?? null, 'player.error', 'log: event сохранён');
    check_eq($lines[0]['screen'] ?? null, 3, 'log: screen сохранён');
    check_eq($lines[0]['data']['file'] ?? null, 'screen-3-a1.mp4', 'log: data сохранена');
    check(($lines[0]['received_at'] ?? '') !== '', 'log: сервер добавил received_at');
    check(($lines[0]['ip'] ?? '') !== '', 'log: сервер добавил ip');
    check(is_file("$dir/logs/screens-" . date('Y-m-d') . '.jsonl'), 'log: файл по дате');
    proc_terminate($proc);
}

function test_api_log_rejects_bad_requests(): void {
    $dir = make_log_sandbox();
    [$proc, $base] = start_server($dir);
    check_eq(http('GET', "$base/api/log.php")['status'], 405, 'log: GET → 405');
    check_eq(post_log($base, '{не json')['status'], 400, 'log: битый JSON → 400');
    check_eq(post_log($base, '{"entries":"x"}')['status'], 400, 'log: entries не массив → 400');
    $big = json_encode(['entries' => [['screen' => 1, 'event' => 'x', 'data' => ['s' => str_repeat('a', 40000)]]]]);
    check_eq(post_log($base, $big)['status'], 413, 'log: тело > 32 КБ → 413');
    check_eq(count(log_lines($dir)), 0, 'log: после плохих запросов файл пуст');
    proc_terminate($proc);
}

function test_log_normalize_entry(): void {
    check_eq(log_normalize_entry(['screen' => 9, 'event' => 'boot']), null, 'norm: screen вне 1..4 отброшен');
    check_eq(log_normalize_entry(['screen' => 1, 'event' => 'Bad Event!']), null, 'norm: кривой event отброшен');
    check_eq(log_normalize_entry('строка'), null, 'norm: не объект отброшен');
    $e = log_normalize_entry(['screen' => '2', 'event' => 'boot', 'level' => 'fatal']);
    check_eq($e['screen'] ?? null, 2, 'norm: screen строкой приводится к int');
    check_eq($e['level'] ?? null, 'info', 'norm: неизвестный level → info');
    $e = log_normalize_entry(['screen' => 1, 'event' => 'js.error', 'data' => ['msg' => str_repeat('я', 900)]]);
    check_eq(mb_strlen($e['data']['msg']), 500, 'norm: длинная строка обрезана до 500');
    $e = log_normalize_entry(['screen' => 1, 'event' => 'x', 'data' => array_fill(0, 30, str_repeat('b', 200))]);
    check_eq($e['data'] ?? null, ['_truncated' => true], 'norm: data > 2 КБ заменена маркером');
    $e = log_normalize_entry(['screen' => 1, 'event' => 'x', 'sid' => str_repeat('s', 100)]);
    check_eq(strlen($e['sid']), 32, 'norm: sid обрезан до 32');
}

function test_log_append_limits(): void {
    $dir = make_log_sandbox();
    $prev = getenv('MOKKO_DATA_DIR');
    putenv("MOKKO_DATA_DIR=$dir");
    $many = array_fill(0, 70, ['screen' => 1, 'event' => 'heartbeat']);
    check_eq(log_append($many, '1.2.3.4'), 50, 'append: не больше 50 записей за раз');
    check_eq(log_append([['screen' => 1, 'event' => 'x']], '1.2.3.4', null, 100), 0,
        'append: дневной файл больше лимита — не пишем');
    $old = "$dir/logs/screens-2000-01-01.jsonl";
    file_put_contents($old, "{}\n");
    touch($old, time() - 31 * 86400);
    $fresh = "$dir/logs/screens-2000-01-02.jsonl";
    file_put_contents($fresh, "{}\n");
    log_cleanup();
    check(!is_file($old), 'cleanup: файл старше 30 дней удалён');
    check(is_file($fresh), 'cleanup: свежий файл остался');
    putenv($prev === false ? 'MOKKO_DATA_DIR' : "MOKKO_DATA_DIR=$prev");
}
