<?php
declare(strict_types=1);
require_once __DIR__ . '/storage.php';

// Журнал событий экранов: data/logs/screens-YYYY-MM-DD.jsonl, одна запись — одна строка.
const LOG_MAX_BATCH = 50;
const LOG_MAX_STRING = 500;
const LOG_MAX_DATA = 2048;
const LOG_MAX_DAY_BYTES = 20 * 1024 * 1024;
const LOG_KEEP_DAYS = 30;

function logs_dir(): string {
    return data_dir() . '/logs';
}

function log_trim_strings(mixed $v, int $depth = 0): mixed {
    if (is_string($v)) return mb_substr($v, 0, LOG_MAX_STRING);
    if (is_array($v)) {
        if ($depth >= 4) return '[…]';
        $out = [];
        foreach ($v as $k => $x) $out[is_int($k) ? $k : mb_substr((string)$k, 0, 64)] = log_trim_strings($x, $depth + 1);
        return $out;
    }
    return is_int($v) || is_float($v) || is_bool($v) || $v === null ? $v : null;
}

/** Приводит запись с экрана к безопасному виду или возвращает null, если она негодна. */
function log_normalize_entry(mixed $e): ?array {
    if (!is_array($e)) return null;
    $screen = filter_var($e['screen'] ?? null, FILTER_VALIDATE_INT);
    if ($screen === false || $screen < 1 || $screen > 4) return null;
    $event = $e['event'] ?? '';
    if (!is_string($event) || !preg_match('/^[a-z0-9._-]{1,64}$/', $event)) return null;
    $level = in_array($e['level'] ?? '', ['info', 'warn', 'error'], true) ? $e['level'] : 'info';
    $data = log_trim_strings($e['data'] ?? null);
    if (strlen((string)json_encode($data, JSON_UNESCAPED_UNICODE)) > LOG_MAX_DATA) $data = ['_truncated' => true];
    return [
        'ts' => substr(is_string($e['ts'] ?? null) ? $e['ts'] : '', 0, 40),
        'screen' => $screen,
        'sid' => substr(is_string($e['sid'] ?? null) ? $e['sid'] : '', 0, 32),
        'level' => $level,
        'event' => $event,
        'data' => $data,
    ];
}

/** Дописывает пачку в дневной файл. Возвращает число записанных записей. */
function log_append(array $entries, string $ip, ?int $now = null, int $maxDayBytes = LOG_MAX_DAY_BYTES): int {
    $now ??= time();
    $dir = logs_dir();
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    $path = $dir . '/screens-' . date('Y-m-d', $now) . '.jsonl';
    clearstatcache(true, $path);
    if (is_file($path) && filesize($path) >= $maxDayBytes) return 0;
    $lines = '';
    $n = 0;
    foreach (array_slice($entries, 0, LOG_MAX_BATCH) as $e) {
        $norm = log_normalize_entry($e);
        if ($norm === null) continue;
        $norm['received_at'] = date('c', $now);
        $norm['ip'] = $ip;
        $lines .= json_encode($norm, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        $n++;
    }
    if ($n > 0) file_put_contents($path, $lines, FILE_APPEND | LOCK_EX);
    return $n;
}

/** Удаляет дневные файлы старше LOG_KEEP_DAYS. */
function log_cleanup(?int $now = null): void {
    $limit = ($now ?? time()) - LOG_KEEP_DAYS * 86400;
    foreach (glob(logs_dir() . '/screens-*.jsonl') ?: [] as $f) {
        if (filemtime($f) < $limit) @unlink($f);
    }
}
