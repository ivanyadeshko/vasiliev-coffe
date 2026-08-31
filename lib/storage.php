<?php
declare(strict_types=1);

function data_dir(): string {
    return getenv('MOKKO_DATA_DIR') ?: dirname(__DIR__) . '/data';
}

function storage_path(string $name): string {
    return data_dir() . '/' . basename($name);
}

function load_json(string $name): ?array {
    $path = storage_path($name);
    if (!is_file($path)) return null;
    $data = json_decode((string)file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function load_json_with_fallback(string $name): ?array {
    $data = load_json($name);
    if ($data !== null) return $data;
    $baks = glob(data_dir() . '/backups/' . basename($name) . '.*.bak') ?: [];
    rsort($baks);
    foreach ($baks as $b) {
        $d = json_decode((string)file_get_contents($b), true);
        if (is_array($d)) { error_log("storage: $name повреждён, использую бэкап " . basename($b)); return $d; }
    }
    return null;
}

function backup_rotate(string $name, int $keep = 10): void {
    $path = storage_path($name);
    if (!is_file($path)) return;
    $bdir = data_dir() . '/backups';
    if (!is_dir($bdir)) mkdir($bdir, 0775, true);
    $mt = microtime(true);
    $stamp = date('Ymd-His', (int)$mt) . sprintf('-%06d', (int)round(($mt - floor($mt)) * 1e6));
    copy($path, $bdir . '/' . basename($name) . '.' . $stamp . '.bak');
    $baks = glob($bdir . '/' . basename($name) . '.*.bak') ?: [];
    sort($baks);
    while (count($baks) > $keep) unlink(array_shift($baks));
}

function save_json_atomic(string $name, array $data): void {
    $path = storage_path($name);
    if (!is_dir(dirname($path))) mkdir(dirname($path), 0775, true);
    backup_rotate($name);
    $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    $fh = fopen($tmp, 'w');
    if ($fh === false) throw new RuntimeException("не могу записать $tmp");
    flock($fh, LOCK_EX);
    fwrite($fh, $json);
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    rename($tmp, $path);
}

function etag_for(string ...$names): string {
    $h = '';
    foreach ($names as $n) {
        $p = storage_path($n);
        $h .= is_file($p) ? md5_file($p) : '0';
    }
    return '"' . md5($h) . '"';
}
