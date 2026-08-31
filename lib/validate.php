<?php
declare(strict_types=1);

function validate_screen(mixed $d): array {
    $errors = [];
    if (!is_array($d)) return ['корень: ожидается объект'];
    $screen = $d['screen'] ?? null;
    if (!is_int($screen) || $screen < 1 || $screen > 4) $errors[] = 'screen: целое 1..4';
    $t = $d['title'] ?? null;
    if (!is_string($t) || $t === '' || mb_strlen($t) > 60) $errors[] = 'title: строка 1..60';
    $media = $d['media'] ?? null;
    if (!is_array($media) || !is_array($media['videos'] ?? null) || !is_string($media['poster'] ?? null))
        $errors[] = 'media: {videos:[…], poster:"…"}';
    $cats = $d['categories'] ?? null;
    if (!is_array($cats)) { $errors[] = 'categories: массив'; return $errors; }
    $itemCount = 0; $seenIds = [];
    foreach ($cats as $ci => $c) {
        $p = "категория[$ci]";
        if (!is_array($c)) { $errors[] = "$p: объект"; continue; }
        if (!is_string($c['id'] ?? null) || !preg_match('/^[a-z0-9-]{1,40}$/', $c['id'])) $errors[] = "$p.id: слаг a-z0-9-";
        if (!is_string($c['title'] ?? null) || $c['title'] === '' || mb_strlen($c['title']) > 60) $errors[] = "$p.title: строка 1..60";
        if (($c['col'] ?? null) !== 1 && ($c['col'] ?? null) !== 2) $errors[] = "$p.col: 1 или 2";
        if (!is_array($c['items'] ?? null)) { $errors[] = "$p.items: массив"; continue; }
        foreach ($c['items'] as $ii => $it) {
            $q = "$p.позиция[$ii]"; $itemCount++;
            if (!is_array($it)) { $errors[] = "$q: объект"; continue; }
            $id = $it['id'] ?? null;
            if (!is_string($id) || !preg_match('/^[a-z0-9-]{1,40}$/', $id)) $errors[] = "$q.id: слаг a-z0-9-";
            elseif (isset($seenIds[$id])) $errors[] = "$q.id: дубликат «{$id}»";
            else $seenIds[$id] = true;
            if (!is_string($it['name'] ?? null) || $it['name'] === '' || mb_strlen($it['name']) > 80) $errors[] = "$q.name: строка 1..80";
            if (!is_string($it['desc'] ?? null) || mb_strlen($it['desc']) > 200) $errors[] = "$q.desc: строка ≤ 200";
            if (!is_string($it['volume'] ?? null) || mb_strlen($it['volume']) > 40) $errors[] = "$q.volume: строка ≤ 40";
            if (!is_bool($it['visible'] ?? null)) $errors[] = "$q.visible: true/false";
            $pr = $it['prices'] ?? null;
            if (!is_array($pr) || count($pr) < 1 || count($pr) > 2) $errors[] = "$q.prices: 1–2 значения";
            else foreach ($pr as $v) {
                $ok = $v === null || ((is_int($v) || is_float($v)) && $v >= 0);
                if (!$ok) $errors[] = "$q.prices: число ≥ 0 или null";
            }
        }
    }
    if ($itemCount > 40) $errors[] = "позиций: $itemCount, максимум 40";
    return $errors;
}
