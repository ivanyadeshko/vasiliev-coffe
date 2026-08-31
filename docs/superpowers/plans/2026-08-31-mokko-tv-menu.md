# МОККО TV-меню — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4 анимированных экрана меню (16:9, 1920×1080) + админка на PHP без БД, локально в Docker.

**Architecture:** PHP 8.3 (apache) отдаёт статичные страницы и крошечный JSON-API поверх файлового хранилища `data/*.json` (атомарная запись, бэкапы). Экраны — фиксированный холст 1920×1080, клиентский рендер меню из JSON, поллинг с ETag, видеофон из двух `<video>` с кроссфейдом. Админка — 4 страницы-редактора за сессионным паролем.

**Tech Stack:** Docker (php:8.3-apache), vanilla PHP/JS/CSS, без composer и без сборки. Тесты — собственный раннер `tests/run.php` внутри контейнера.

**Spec:** `docs/superpowers/specs/2026-08-31-menu-screens-design.md` (+ `docs/design-system.md`, `docs/screens.md`)

## Global Constraints

- PHP ≥ 8.3, без composer-зависимостей; JS — ES2017, без сборки; никаких внешних CDN (шрифты self-hosted).
- Бренд «МОККО», валюта ₽, все тексты интерфейса — по-русски.
- `data/` вне docroot (в контейнере `/var/www/data`, docroot `/var/www/html`).
- Все записи на диск — только через `save_json_atomic` (tmp+rename, flock, бэкап-ротация 10).
- Цены: массив 1–2 значений, число ≥ 0 или `null` (на экране `null` → «—»).
- Пути в PHP: из `public/*` — `require __DIR__ . '/../lib/…'`, из `public/api|admin/*` — `require __DIR__ . '/../../lib/…'`.
- Тесты гоняются так: `docker compose exec web php /var/www/tests/run.php` (все, каждый раз).
- Коммит после каждой задачи; сообщения `feat:|test:|docs:` по-русски.

---

### Task 1: Docker-окружение и скелет

**Files:**
- Create: `docker-compose.yml`, `public/index.php`, `.gitignore` (дополнить), пустые каталоги `lib/`, `tests/`, `public/{api,admin,assets/{css,js,fonts,video,img}}`

**Interfaces:**
- Produces: работающий `http://localhost:8080/` (страница-оглавление), том `/var/www/data`.

- [ ] **Step 1: docker-compose.yml**

```yaml
services:
  web:
    image: php:8.3-apache
    ports:
      - "8080:80"
    volumes:
      - ./public:/var/www/html
      - ./lib:/var/www/lib
      - ./data:/var/www/data
      - ./tests:/var/www/tests
```

- [ ] **Step 2: скелет каталогов и заглушки**

```bash
mkdir -p lib tests data public/api public/admin public/assets/{css,js,fonts,video,img}
touch lib/.gitkeep tests/.gitkeep public/assets/video/.gitkeep public/assets/img/.gitkeep
```

`public/index.php`:

```php
<?php declare(strict_types=1); ?>
<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>МОККО · экраны</title>
<style>body{font-family:sans-serif;background:#120D0A;color:#F4EAD9;padding:40px}
a{color:#E9A23B;display:block;margin:8px 0;font-size:20px}</style></head><body>
<h1>МОККО — TV-меню</h1>
<a href="/screen.php?id=1">Экран 1 · Горячие напитки</a>
<a href="/screen.php?id=2">Экран 2 · Холодные напитки</a>
<a href="/screen.php?id=3">Экран 3 · Завтраки</a>
<a href="/screen.php?id=4">Экран 4 · Фастфуд и десерты</a>
<a href="/admin/">Админка</a>
</body></html>
```

В `.gitignore` добавить строки:

```
data/backups/
public/assets/fonts/*.woff2
public/assets/video/*.mp4
```

- [ ] **Step 3: поднять и проверить**

```bash
docker compose up -d
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/   # ожидаем 200
docker compose exec web php -r 'var_dump(is_writable("/var/www/data"));'  # bool(true)
```

Если `data` не пишется (VirtioFS/права): `chmod -R a+rwX data` и повторить.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml public/index.php .gitignore lib tests public
git commit -m "feat: docker-окружение и скелет проекта"
```

---

### Task 2: Тест-раннер и storage (TDD)

**Files:**
- Create: `tests/run.php`, `tests/storage_test.php`, `lib/storage.php`

**Interfaces:**
- Produces: `data_dir(): string` (уважает env `MOKKO_DATA_DIR`), `load_json(string $name): ?array`, `load_json_with_fallback(string $name): ?array`, `save_json_atomic(string $name, array $data): void`, `etag_for(string ...$names): string`.

- [ ] **Step 1: tests/run.php**

```php
<?php
declare(strict_types=1);
$GLOBALS['__pass'] = 0; $GLOBALS['__fail'] = 0;
function check(bool $cond, string $msg): void {
    if ($cond) { $GLOBALS['__pass']++; }
    else { $GLOBALS['__fail']++; fwrite(STDERR, "FAIL: $msg\n"); }
}
function check_eq(mixed $got, mixed $want, string $msg): void {
    check($got === $want, $msg . ' (got ' . var_export($got, true) . ', want ' . var_export($want, true) . ')');
}
foreach (glob(__DIR__ . '/*_test.php') as $f) require $f;
foreach (get_defined_functions()['user'] as $fn) {
    if (str_starts_with($fn, 'test_')) $fn();
}
printf("\n%d passed, %d failed\n", $GLOBALS['__pass'], $GLOBALS['__fail']);
exit($GLOBALS['__fail'] > 0 ? 1 : 0);
```

- [ ] **Step 2: падающий тест tests/storage_test.php**

```php
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
```

Примечание: имена бэкапов включают микросекунды (см. `backup_rotate` ниже) —
13 сохранений подряд дают 12 уникальных бэкапов (при первом сохранении файла
ещё нет), ротация оставляет 10.

- [ ] **Step 3: убедиться, что тесты падают**

```bash
docker compose exec web php /var/www/tests/run.php
```

Ожидаем: fatal `Failed opening required '../lib/storage.php'`.

- [ ] **Step 4: lib/storage.php**

```php
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
```

- [ ] **Step 5: тесты зелёные**

```bash
docker compose exec web php /var/www/tests/run.php   # 0 failed
```

- [ ] **Step 6: Commit**

```bash
git add tests/run.php tests/storage_test.php lib/storage.php
git commit -m "feat: файловое хранилище с атомарной записью, бэкапами и etag"
```

---

### Task 3: Валидация экрана (TDD)

**Files:**
- Create: `tests/validate_test.php`, `lib/validate.php`

**Interfaces:**
- Produces: `validate_screen(mixed $d): array` — список ошибок (пустой = валидно).

- [ ] **Step 1: падающий тест tests/validate_test.php**

```php
<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/validate.php';

function valid_screen_fixture(): array {
    return [
        'screen' => 1, 'title' => 'Горячие напитки',
        'media' => ['videos' => [], 'poster' => ''],
        'categories' => [[
            'id' => 'classic', 'title' => 'Классический кофе', 'col' => 1,
            'items' => [[
                'id' => 'latte', 'name' => 'Латте', 'desc' => '', 'volume' => '350/450 мл',
                'prices' => [220, 260], 'visible' => true,
            ]],
        ]],
    ];
}
function test_validate_ok(): void {
    check_eq(validate_screen(valid_screen_fixture()), [], 'валидный экран без ошибок');
}
function test_validate_null_price_ok(): void {
    $d = valid_screen_fixture();
    $d['categories'][0]['items'][0]['prices'] = [null];
    check_eq(validate_screen($d), [], 'null-цена допустима');
}
function test_validate_rejects(): void {
    check(validate_screen('строка') !== [], 'не объект');
    $d = valid_screen_fixture(); $d['screen'] = 9;
    check(validate_screen($d) !== [], 'screen вне 1..4');
    $d = valid_screen_fixture(); $d['categories'][0]['items'][0]['prices'] = [];
    check(validate_screen($d) !== [], 'пустые цены');
    $d = valid_screen_fixture(); $d['categories'][0]['items'][0]['prices'] = [1, 2, 3];
    check(validate_screen($d) !== [], 'три цены');
    $d = valid_screen_fixture(); $d['categories'][0]['items'][0]['prices'] = [-5];
    check(validate_screen($d) !== [], 'отрицательная цена');
    $d = valid_screen_fixture(); $d['categories'][0]['items'][0]['visible'] = 'да';
    check(validate_screen($d) !== [], 'visible не bool');
    $d = valid_screen_fixture(); $d['categories'][0]['col'] = 3;
    check(validate_screen($d) !== [], 'col вне 1|2');
    $d = valid_screen_fixture(); $d['categories'][0]['items'][0]['id'] = 'Плохой ID!';
    check(validate_screen($d) !== [], 'id не по слагу');
    $d = valid_screen_fixture();
    $d['categories'][0]['items'][] = $d['categories'][0]['items'][0]; // дубль id
    check(validate_screen($d) !== [], 'дубликат id позиции');
    $d = valid_screen_fixture();
    $it = $d['categories'][0]['items'][0];
    $d['categories'][0]['items'] = [];
    for ($i = 0; $i < 41; $i++) { $it['id'] = "i$i"; $d['categories'][0]['items'][] = $it; }
    check(validate_screen($d) !== [], 'больше 40 позиций');
}
```

- [ ] **Step 2: запустить — падает** (нет `lib/validate.php`).

- [ ] **Step 3: lib/validate.php**

```php
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
```

- [ ] **Step 4: тесты зелёные** (`docker compose exec web php /var/www/tests/run.php`).

- [ ] **Step 5: Commit**

```bash
git add tests/validate_test.php lib/validate.php
git commit -m "feat: валидация данных экрана"
```

---

### Task 4: Seed-данные, settings и пароль админа

**Files:**
- Create: `data/settings.json`, `data/screen-1.json` … `data/screen-4.json`, `bin/set-password.php`, `tests/seed_test.php`

**Interfaces:**
- Produces: файлы данных по схеме из Task 3; `settings.json` c ключами `brand, currency, poll_seconds, reload_at, admin_password_hash`.

- [ ] **Step 1: тест, что сиды валидны (tests/seed_test.php)**

```php
<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/validate.php';

function test_seed_files_valid(): void {
    $dir = '/var/www/data';
    for ($i = 1; $i <= 4; $i++) {
        $d = json_decode((string)file_get_contents("$dir/screen-$i.json"), true);
        check(is_array($d), "screen-$i.json парсится");
        if (is_array($d)) {
            check_eq(validate_screen($d), [], "screen-$i.json валиден");
            check_eq($d['screen'], $i, "screen-$i.json: правильный номер");
        }
    }
    $s = json_decode((string)file_get_contents("$dir/settings.json"), true);
    check(is_array($s), 'settings.json парсится');
    foreach (['brand', 'currency', 'poll_seconds', 'reload_at', 'admin_password_hash'] as $k)
        check(array_key_exists($k, $s ?? []), "settings.$k есть");
    check_eq($s['brand'] ?? '', 'МОККО', 'brand');
    check_eq($s['currency'] ?? '', '₽', 'currency');
}
```

Примечание: тест читает боевой `/var/www/data` (не `MOKKO_DATA_DIR`) — это
осознанно, он проверяет именно сиды репозитория.

- [ ] **Step 2: запустить — падает** (файлов нет).

- [ ] **Step 3: bin/set-password.php**

```php
<?php
declare(strict_types=1);
require __DIR__ . '/../lib/storage.php';
$pw = $argv[1] ?? '';
if ($pw === '') { fwrite(STDERR, "использование: php bin/set-password.php <пароль>\n"); exit(1); }
$s = load_json('settings.json') ?? [];
$s['admin_password_hash'] = password_hash($pw, PASSWORD_DEFAULT);
save_json_atomic('settings.json', $s);
echo "пароль обновлён\n";
```

- [ ] **Step 4: data/settings.json**

```json
{
    "brand": "МОККО",
    "currency": "₽",
    "poll_seconds": 60,
    "reload_at": "04:00",
    "admin_password_hash": ""
}
```

Затем добавить в `docker-compose.yml` том `- ./bin:/var/www/bin` и задать
пароль по умолчанию (он фиксируется в README в Task 12):

```bash
docker compose up -d
docker compose exec web php /var/www/bin/set-password.php mokko2026
```

- [ ] **Step 5: data/screen-1.json**

```json
{
    "screen": 1,
    "title": "Горячие напитки",
    "updated_at": "2026-08-31T12:00:00+03:00",
    "media": { "videos": [], "poster": "" },
    "categories": [
        {
            "id": "classic", "title": "Классический кофе", "col": 1,
            "items": [
                { "id": "espresso", "name": "Эспрессо", "desc": "", "volume": "40 мл", "prices": [null], "visible": true },
                { "id": "americano", "name": "Американо", "desc": "", "volume": "250 мл", "prices": [null], "visible": true },
                { "id": "latte", "name": "Латте", "desc": "", "volume": "350/450 мл", "prices": [null, null], "visible": true },
                { "id": "cappuccino", "name": "Капучино", "desc": "", "volume": "350/450 мл", "prices": [null, null], "visible": true },
                { "id": "flat-white", "name": "Флэт Уайт", "desc": "", "volume": "350 мл", "prices": [null], "visible": true },
                { "id": "raf", "name": "Раф", "desc": "", "volume": "350/450 мл", "prices": [null, null], "visible": true },
                { "id": "mokko", "name": "Мокко", "desc": "", "volume": "350/450 мл", "prices": [null, null], "visible": true }
            ]
        },
        {
            "id": "tea-cocoa", "title": "Чай и какао", "col": 1,
            "items": [
                { "id": "tea", "name": "Чай", "desc": "", "volume": "", "prices": [null], "visible": true },
                { "id": "hot-chocolate", "name": "Горячий шоколад", "desc": "", "volume": "", "prices": [null], "visible": true }
            ]
        },
        {
            "id": "author", "title": "Авторский кофе", "col": 2,
            "items": [
                { "id": "raf-syrny", "name": "Раф сырный", "desc": "со сливочным сыром", "volume": "", "prices": [null], "visible": true },
                { "id": "raf-popcorn", "name": "Раф попкорн", "desc": "солёная карамель, попкорн", "volume": "", "prices": [null], "visible": true },
                { "id": "snickers", "name": "Сникерс", "desc": "арахис, ореховый и карамельный сиропы", "volume": "", "prices": [null], "visible": true },
                { "id": "bounty", "name": "Баунти", "desc": "кокосовый сироп, кокосовая стружка, шоколадный топпинг", "volume": "", "prices": [null], "visible": true },
                { "id": "mokko-shokoladny", "name": "Мокко шоколадный", "desc": "шоколадный сироп, тёртый шоколад", "volume": "", "prices": [null], "visible": true },
                { "id": "mokko-oreo", "name": "Мокко Орео", "desc": "с печеньем Орео", "volume": "", "prices": [null], "visible": true }
            ]
        }
    ]
}
```

- [ ] **Step 6: data/screen-2.json**

```json
{
    "screen": 2,
    "title": "Холодные напитки",
    "updated_at": "2026-08-31T12:00:00+03:00",
    "media": { "videos": [], "poster": "" },
    "categories": [
        {
            "id": "ice-coffee", "title": "Айс-кофе", "col": 1,
            "items": [
                { "id": "bumble", "name": "Бамбл", "desc": "холодный кофе, апельсиновый сок, карамельный сироп", "volume": "", "prices": [null], "visible": true },
                { "id": "espresso-tonic", "name": "Эспрессо тоник", "desc": "холодный кофе, тоник Rich Indian", "volume": "", "prices": [null], "visible": true },
                { "id": "ice-latte", "name": "Айс латте", "desc": "эспрессо, лёд, холодное молоко", "volume": "", "prices": [null], "visible": true },
                { "id": "frappe", "name": "Фраппе", "desc": "холодный кофе, молоко, мороженое, сироп: баунти, сникерс, шоколад, тирамису, попкорн, клубника", "volume": "", "prices": [null], "visible": true }
            ]
        },
        {
            "id": "bubble", "title": "Бабл-ти", "col": 1,
            "items": [
                { "id": "bubble-tea-milk", "name": "Бабл-ти молочный", "desc": "клубника, банан, дыня, лесные ягоды, черника", "volume": "", "prices": [null], "visible": true },
                { "id": "bubble-lemonade", "name": "Бабл-лимонад", "desc": "лесные ягоды, голубая лагуна, чёрная смородина–мята, клубника–дыня, клубника–банан, манго–маракуйя", "volume": "", "prices": [null], "visible": true }
            ]
        },
        {
            "id": "milkshakes", "title": "Милкшейки", "col": 2,
            "items": [
                { "id": "milkshake", "name": "Милкшейк", "desc": "ваниль, орео, баунти, сникерс, шоколад, карамель, банан, лесные ягоды, арбуз, черника, клубника, дыня, бабл-гам", "volume": "", "prices": [null], "visible": true }
            ]
        },
        {
            "id": "lemonades", "title": "Лимонады", "col": 2,
            "items": [
                { "id": "lemonade", "name": "Лимонад", "desc": "мохито классический/клубничный, лесные ягоды, пина-колада, голубая лагуна, чёрная смородина–мята, клубника–дыня, клубника–банан, манго–маракуйя, гренадин с апельсиновым соком", "volume": "", "prices": [null], "visible": true }
            ]
        }
    ]
}
```

- [ ] **Step 7: data/screen-3.json**

```json
{
    "screen": 3,
    "title": "Завтраки",
    "updated_at": "2026-08-31T12:00:00+03:00",
    "media": { "videos": [], "poster": "" },
    "categories": [
        {
            "id": "sandwiches", "title": "Сэндвичи и круассаны", "col": 1,
            "items": [
                { "id": "sandwich-ham", "name": "Сэндвич с ветчиной", "desc": "ветчина, сыр, томат, листья салата, белый соус", "volume": "", "prices": [null], "visible": true },
                { "id": "sandwich-turkey", "name": "Сэндвич с индейкой", "desc": "индейка, бекон, томат, листья салата, белый соус", "volume": "", "prices": [null], "visible": true },
                { "id": "croissant-chicken", "name": "Круассан с курицей", "desc": "копчёная курица, листья салата, малосольный огурец, томат, соус бургер", "volume": "", "prices": [null], "visible": true },
                { "id": "croissant-salmon", "name": "Круассан с лососем", "desc": "лосось, творожный сыр, огурец, листья салата", "volume": "", "prices": [null], "visible": true }
            ]
        },
        {
            "id": "bowls", "title": "Боулы и салаты", "col": 1,
            "items": [
                { "id": "bowl-fish", "name": "Боул с красной рыбой", "desc": "рис, красная рыба, яйцо, огурец, кукуруза, брокколи", "volume": "", "prices": [null], "visible": true },
                { "id": "bowl-chicken", "name": "Боул с курицей", "desc": "рис, курица, томат, яйцо, авокадо, огурец", "volume": "", "prices": [null], "visible": true },
                { "id": "caesar", "name": "Салат Цезарь", "desc": "пекинская капуста, томат, курица, сухарики, сыр, соус цезарь", "volume": "", "prices": [null], "visible": true }
            ]
        },
        {
            "id": "hot-breakfast", "title": "Горячие завтраки", "col": 2,
            "items": [
                { "id": "syrniki", "name": "Сырники", "desc": "", "volume": "", "prices": [null], "visible": true },
                { "id": "oladi", "name": "Оладьи", "desc": "", "volume": "", "prices": [null], "visible": true },
                { "id": "kasha-banan", "name": "Каша овсяная с бананом и мёдом", "desc": "на молоке", "volume": "", "prices": [null], "visible": true },
                { "id": "kasha-avocado", "name": "Каша овсяная с сыром и авокадо", "desc": "на молоке", "volume": "", "prices": [null], "visible": true },
                { "id": "english-breakfast", "name": "Английский завтрак", "desc": "яйца 2 шт., сосиска, бекон, томат, листья салата, хрустящий хлеб", "volume": "", "prices": [null], "visible": true },
                { "id": "omlet", "name": "Омлет", "desc": "ветчина, сыр, авокадо, томат", "volume": "", "prices": [null], "visible": true },
                { "id": "blinchiki", "name": "Блинчики", "desc": "ветчина, сыр", "volume": "", "prices": [null], "visible": true }
            ]
        }
    ]
}
```

- [ ] **Step 8: data/screen-4.json**

```json
{
    "screen": 4,
    "title": "Фастфуд и десерты",
    "updated_at": "2026-08-31T12:00:00+03:00",
    "media": { "videos": [], "poster": "" },
    "categories": [
        {
            "id": "shaurma", "title": "Шаурмикс", "col": 1,
            "items": [
                { "id": "shaurma-classic", "name": "Классическая", "desc": "пекинская капуста, курица, красный лук, томат, огурец, томатный и чесночный соусы", "volume": "", "prices": [null], "visible": true },
                { "id": "shaurma-bbq", "name": "Барбекю", "desc": "пекинская капуста, курица, красный лук, томат, огурец, чесночный соус и барбекю", "volume": "", "prices": [null], "visible": true },
                { "id": "shaurma-spicy", "name": "Пикантная", "desc": "пекинская капуста, курица, красный лук, морковь по-корейски, томат, огурец, чесночный и карри соусы", "volume": "", "prices": [null], "visible": true },
                { "id": "shaurma-jalapeno", "name": "Халапеньо", "desc": "пекинская капуста, курица, красный лук, томат, перец халапеньо, томатный и чесночный соусы", "volume": "", "prices": [null], "visible": true },
                { "id": "shaurma-cheese", "name": "Сырная", "desc": "пекинская капуста, курица, красный лук, томат, огурец, моцарелла, томатный и чесночный соусы", "volume": "", "prices": [null], "visible": true },
                { "id": "shaurma-big-tasty", "name": "Биг тейсти", "desc": "пекинская капуста, курица, красный лук, томат, картофель фри, соус гриль-тейсти", "volume": "", "prices": [null], "visible": true }
            ]
        },
        {
            "id": "snacks", "title": "Закуски и хот-доги", "col": 2,
            "items": [
                { "id": "fries", "name": "Картофель фри", "desc": "", "volume": "", "prices": [null], "visible": true },
                { "id": "nuggets", "name": "Наггетсы", "desc": "", "volume": "", "prices": [null], "visible": true },
                { "id": "hotdog-french", "name": "Хот-дог французский", "desc": "закрытая булочка, сосиска, томатный и горчичный соусы", "volume": "", "prices": [null], "visible": true },
                { "id": "hotdog-danish", "name": "Хот-дог датский", "desc": "открытая булочка, сосиска, малосольный огурец, жареный лук, томатный и горчичный соусы", "volume": "", "prices": [null], "visible": true }
            ]
        },
        {
            "id": "desserts", "title": "Десерты", "col": 2,
            "items": [
                { "id": "ekler", "name": "Эклер", "desc": "", "volume": "", "prices": [null], "visible": true },
                { "id": "donuts", "name": "Донаты", "desc": "", "volume": "", "prices": [null], "visible": true },
                { "id": "cheesecake", "name": "Чизкейк в асс.", "desc": "", "volume": "", "prices": [null], "visible": true },
                { "id": "tort", "name": "Торт в асс.", "desc": "", "volume": "", "prices": [null], "visible": true },
                { "id": "trubochki", "name": "Трубочки", "desc": "", "volume": "", "prices": [null], "visible": true },
                { "id": "oreshki", "name": "Орешки", "desc": "", "volume": "", "prices": [null], "visible": true }
            ]
        }
    ]
}
```

- [ ] **Step 9: тесты зелёные; пароль установлен**

```bash
docker compose exec web php /var/www/tests/run.php
docker compose exec web php /var/www/bin/set-password.php mokko2026
docker compose exec web php -r '$s=json_decode(file_get_contents("/var/www/data/settings.json"),true); var_dump($s["admin_password_hash"] !== "");'
```

- [ ] **Step 10: Commit**

```bash
git add data docker-compose.yml bin tests/seed_test.php
git commit -m "feat: seed-данные 4 экранов, настройки и пароль админа"
```

---

### Task 5: API чтения меню (menu.php)

**Files:**
- Create: `public/api/menu.php`, `tests/helpers.php`, `tests/api_menu_test.php`

**Interfaces:**
- Consumes: `load_json_with_fallback`, `load_json`, `etag_for` из Task 2.
- Produces: `GET /api/menu.php?screen=N` → `{settings:{brand,currency,poll_seconds,reload_at}, menu:{…}}` + заголовок `ETag`; `304` при совпадении `If-None-Match`; `404` при неверном id.
- Produces (для тестов): `tests/helpers.php` с `http(string $method, string $url, array $opts=[]): array{status:int, headers:array, body:string}` и `start_server(string $dataDir): array{resource, string}` (встроенный сервер PHP на случайном порту с `-t /var/www/html`).

- [ ] **Step 1: tests/helpers.php**

```php
<?php
declare(strict_types=1);

function http(string $method, string $url, array $opts = []): array {
    $ctx = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $opts['headers'] ?? []),
        'content' => $opts['body'] ?? null,
        'ignore_errors' => true,
        'follow_location' => 0,
        'timeout' => 5,
    ]]);
    $body = (string)@file_get_contents($url, false, $ctx);
    $status = 0; $headers = [];
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#^HTTP/\S+ (\d+)#', $h, $m)) { $status = (int)$m[1]; }
        elseif (str_contains($h, ':')) { [$k, $v] = explode(':', $h, 2); $headers[strtolower(trim($k))] = trim($v); }
    }
    return ['status' => $status, 'headers' => $headers, 'body' => $body];
}

function start_server(string $dataDir): array {
    $port = 8901 + random_int(0, 90);
    $cmd = 'MOKKO_DATA_DIR=' . escapeshellarg($dataDir) . ' php -S 127.0.0.1:' . $port . ' -t /var/www/html';
    $proc = proc_open($cmd, [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']], $pipes);
    for ($i = 0; $i < 50; $i++) {
        usleep(100000);
        $c = @fsockopen('127.0.0.1', $port);
        if ($c) { fclose($c); break; }
    }
    return [$proc, "http://127.0.0.1:$port"];
}
```

- [ ] **Step 2: падающий тест tests/api_menu_test.php**

```php
<?php
declare(strict_types=1);
require_once __DIR__ . '/helpers.php';

function test_api_menu(): void {
    [$proc, $base] = start_server('/var/www/data');
    $r = http('GET', "$base/api/menu.php?screen=1");
    check_eq($r['status'], 200, 'menu 200');
    $j = json_decode($r['body'], true);
    check_eq($j['settings']['brand'] ?? null, 'МОККО', 'brand в ответе');
    check_eq($j['settings']['currency'] ?? null, '₽', 'currency в ответе');
    check_eq($j['menu']['screen'] ?? null, 1, 'menu.screen');
    check(($r['headers']['etag'] ?? '') !== '', 'есть ETag');
    check(str_contains($r['headers']['cache-control'] ?? '', 'no-store'), 'no-store');

    $r2 = http('GET', "$base/api/menu.php?screen=1", ['headers' => ['If-None-Match: ' . $r['headers']['etag']]]);
    check_eq($r2['status'], 304, '304 при совпадении etag');

    $r3 = http('GET', "$base/api/menu.php?screen=9");
    check_eq($r3['status'], 404, '404 для неверного экрана');
    proc_terminate($proc);
}
```

- [ ] **Step 3: запустить — падает** (404 от роутера: файла нет).

- [ ] **Step 4: public/api/menu.php**

```php
<?php
declare(strict_types=1);
require __DIR__ . '/../../lib/storage.php';

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
```

- [ ] **Step 5: тесты зелёные.** Также руками: `curl -si "http://localhost:8080/api/menu.php?screen=1" | head -20`.

- [ ] **Step 6: Commit**

```bash
git add public/api/menu.php tests/helpers.php tests/api_menu_test.php
git commit -m "feat: api чтения меню с etag/304"
```

---

### Task 6: Авторизация и страницы входа

**Files:**
- Create: `lib/auth.php`, `public/admin/login.php`, `public/admin/logout.php`, `public/assets/css/admin.css`, `tests/auth_test.php`

**Interfaces:**
- Consumes: `load_json` (Task 2).
- Produces: `auth_boot(): void`, `is_admin(): bool`, `require_admin_page(): void` (redirect на login), `require_admin_api(): void` (403 JSON), `try_login(string $password): bool`, `csrf_token(): string`, `check_csrf(): void` (читает заголовок `X-CSRF-Token`). Страницы `/admin/login.php`, `/admin/logout.php`.

- [ ] **Step 1: падающий тест tests/auth_test.php** (HTTP-уровень: логин ставит cookie, без логина — redirect)

```php
<?php
declare(strict_types=1);
require_once __DIR__ . '/helpers.php';

function test_auth_flow(): void {
    [$proc, $base] = start_server('/var/www/data');

    $r = http('GET', "$base/admin/login.php");
    check_eq($r['status'], 200, 'страница логина открывается');

    $r = http('POST', "$base/admin/login.php", [
        'headers' => ['Content-Type: application/x-www-form-urlencoded'],
        'body' => 'password=' . urlencode('неверный'),
    ]);
    check(str_contains($r['body'], 'Неверный пароль'), 'ошибка при неверном пароле');

    $r = http('POST', "$base/admin/login.php", [
        'headers' => ['Content-Type: application/x-www-form-urlencoded'],
        'body' => 'password=mokko2026',
    ]);
    check_eq($r['status'], 302, 'redirect после входа');
    $cookie = explode(';', $r['headers']['set-cookie'] ?? '')[0];
    check($cookie !== '', 'выдана cookie сессии');
    proc_terminate($proc);
}
```

- [ ] **Step 2: запустить — падает.**

- [ ] **Step 3: lib/auth.php**

```php
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
```

- [ ] **Step 4: public/admin/login.php**

```php
<?php
declare(strict_types=1);
require __DIR__ . '/../../lib/auth.php';
auth_boot();
if (is_admin()) { header('Location: /admin/'); exit; }
$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (try_login((string)($_POST['password'] ?? ''))) { header('Location: /admin/'); exit; }
    $error = 'Неверный пароль';
}
?>
<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МОККО · вход</title>
<link rel="stylesheet" href="/assets/css/admin.css"></head>
<body class="login-page">
<form method="post" class="login-box">
    <h1>МОККО · админка</h1>
    <?php if ($error): ?><p class="err"><?= htmlspecialchars($error) ?></p><?php endif; ?>
    <input type="password" name="password" placeholder="Пароль" autofocus required>
    <button type="submit">Войти</button>
</form>
</body></html>
```

- [ ] **Step 5: public/admin/logout.php**

```php
<?php
declare(strict_types=1);
require __DIR__ . '/../../lib/auth.php';
auth_boot();
$_SESSION = [];
session_destroy();
header('Location: /admin/login.php');
```

- [ ] **Step 6: public/assets/css/admin.css** (база; редактор дополнит Task 11)

```css
:root {
    --bg: #171210; --panel: #221A15; --line: rgba(244,234,217,.15);
    --accent: #E9A23B; --text: #F4EAD9; --mut: #A89A88; --err: #E06A4A; --ok: #7CB56B;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
    font: 16px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; }
button { font: inherit; cursor: pointer; }
input { font: inherit; }
.err { color: var(--err); }
.ok { color: var(--ok); }

.login-page { display: grid; place-items: center; min-height: 100vh; }
.login-box { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
    padding: 32px; width: min(360px, 90vw); display: grid; gap: 14px; }
.login-box h1 { font-size: 20px; margin: 0; color: var(--accent); }
.login-box input { padding: 12px 14px; border-radius: 8px; border: 1px solid var(--line);
    background: var(--bg); color: var(--text); }
.login-box button { padding: 12px; border-radius: 8px; border: none;
    background: var(--accent); color: #1a1208; font-weight: 700; }
```

- [ ] **Step 7: тесты зелёные.**

- [ ] **Step 8: Commit**

```bash
git add lib/auth.php public/admin/login.php public/admin/logout.php public/assets/css/admin.css tests/auth_test.php
git commit -m "feat: авторизация админки, вход и выход"
```

---

### Task 7: API сохранения (save.php)

**Files:**
- Create: `public/api/save.php`, `tests/api_save_test.php`
- Modify: `tests/helpers.php` (добавить `login_and_csrf`)

**Interfaces:**
- Consumes: `require_admin_api`, `check_csrf` (Task 6), `validate_screen` (Task 3), `save_json_atomic`, `load_json_with_fallback` (Task 2).
- Produces: `POST /api/save.php` (JSON тела = экран целиком) → `{ok:true, updated_at}`; 403 без сессии/CSRF; 422 с `{errors:[…]}`; `media` из тела игнорируется (берётся текущее из файла); `updated_at` ставит сервер.

- [ ] **Step 1: helper логина — добавить в tests/helpers.php**

```php
function login_and_csrf(string $base, string $password): array {
    $r = http('POST', "$base/admin/login.php", [
        'headers' => ['Content-Type: application/x-www-form-urlencoded'],
        'body' => 'password=' . urlencode($password),
    ]);
    $cookie = explode(';', $r['headers']['set-cookie'] ?? '')[0];
    // CSRF-токен отдаёт мини-эндпоинт /admin/token.php (Step 2 этой задачи):
    // страница-редактор появится только в Task 11, а токен нужен тестам уже здесь.
    $r2 = http('GET', "$base/admin/token.php", ['headers' => ["Cookie: $cookie"]]);
    $csrf = trim($r2['body']);
    return [$cookie, $csrf];
}
```

- [ ] **Step 2: public/admin/token.php** (крошечный эндпоинт: отдаёт CSRF-токен админ-сессии; нужен и админке Task 11 — она рендерит его в страницу сама, но эндпоинт безвреден и полезен тестам)

```php
<?php
declare(strict_types=1);
require __DIR__ . '/../../lib/auth.php';
require_admin_api();
header('Content-Type: text/plain; charset=utf-8');
echo csrf_token();
```

- [ ] **Step 3: падающий тест tests/api_save_test.php**

```php
<?php
declare(strict_types=1);
require_once __DIR__ . '/helpers.php';

function make_save_sandbox(): string {
    $dir = sys_get_temp_dir() . '/mokko-save-' . getmypid() . '-' . random_int(1000, 9999);
    mkdir($dir, 0777, true);
    foreach (['settings.json', 'screen-1.json'] as $f) copy("/var/www/data/$f", "$dir/$f");
    return $dir;
}

function test_save_requires_auth(): void {
    [$proc, $base] = start_server(make_save_sandbox());
    $r = http('POST', "$base/api/save.php", ['body' => '{}', 'headers' => ['Content-Type: application/json']]);
    check_eq($r['status'], 403, 'save без сессии → 403');
    proc_terminate($proc);
}

function test_save_flow(): void {
    $dir = make_save_sandbox();
    [$proc, $base] = start_server($dir);
    [$cookie, $csrf] = login_and_csrf($base, 'mokko2026');
    check($csrf !== '', 'получен csrf');

    $menu = json_decode((string)file_get_contents("$dir/screen-1.json"), true);
    $menu['categories'][0]['items'][0]['prices'] = [140];
    $menu['media'] = ['videos' => ['hack.mp4'], 'poster' => 'hack.jpg']; // должно быть проигнорировано

    $r = http('POST', "$base/api/save.php", [
        'headers' => ["Cookie: $cookie", "X-CSRF-Token: $csrf", 'Content-Type: application/json'],
        'body' => json_encode($menu, JSON_UNESCAPED_UNICODE),
    ]);
    check_eq($r['status'], 200, 'save 200');
    $saved = json_decode((string)file_get_contents("$dir/screen-1.json"), true);
    check_eq($saved['categories'][0]['items'][0]['prices'], [140], 'цена сохранена');
    check_eq($saved['media']['videos'], [], 'media не затёрта клиентом');
    check($saved['updated_at'] !== $menu['updated_at'], 'updated_at обновлён сервером');

    $bad = $menu; $bad['screen'] = 7;
    $r = http('POST', "$base/api/save.php", [
        'headers' => ["Cookie: $cookie", "X-CSRF-Token: $csrf", 'Content-Type: application/json'],
        'body' => json_encode($bad),
    ]);
    check_eq($r['status'], 422, 'невалидный экран → 422');

    $r = http('POST', "$base/api/save.php", [
        'headers' => ["Cookie: $cookie", 'X-CSRF-Token: wrong', 'Content-Type: application/json'],
        'body' => json_encode($menu, JSON_UNESCAPED_UNICODE),
    ]);
    check_eq($r['status'], 403, 'неверный csrf → 403');
    proc_terminate($proc);
}
```

- [ ] **Step 4: запустить — падает.**

- [ ] **Step 5: public/api/save.php**

```php
<?php
declare(strict_types=1);
require __DIR__ . '/../../lib/storage.php';
require __DIR__ . '/../../lib/auth.php';
require __DIR__ . '/../../lib/validate.php';

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
```

- [ ] **Step 6: тесты зелёные.**

- [ ] **Step 7: Commit**

```bash
git add public/api/save.php public/admin/token.php tests/helpers.php tests/api_save_test.php
git commit -m "feat: api сохранения экрана с валидацией и защитой"
```

---

### Task 8: Экран ТВ — страница, шрифты, стили, первичный рендер

**Files:**
- Create: `public/screen.php`, `public/assets/css/screen.css`, `public/assets/js/screen.js` (первая версия без поллинга), `bin/fetch-fonts.sh`

**Interfaces:**
- Consumes: `GET /api/menu.php?screen=N` (Task 5).
- Produces: страница `/screen.php?id=N`; DOM-контракт для Task 9–10: `#stage`, `#fit`, `#menu`, `#title`, `#brand`, `#clock`, `#vitrine` c `#vid-a`, `#vid-b`, `#poster`; в `screen.js` функции `render(payload)`, `priceText(prices)`, глобальный поток: `fetch → applyPayload(payload)`.

- [ ] **Step 1: bin/fetch-fonts.sh + запуск**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../public/assets/fonts"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
URL="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap"
curl -sf -A "$UA" "$URL" -o fonts-src.css
grep -o 'https://fonts.gstatic.com/[^)]*' fonts-src.css | sort -u | while read -r u; do
  curl -sf -o "$(basename "$u")" "$u"
done
sed -E 's#url\(https://fonts.gstatic.com/[^)]*/([^/)]+)\)#url(/assets/fonts/\1)#g' fonts-src.css > fonts.css
rm fonts-src.css
echo "готово: $(ls *.woff2 | wc -l) файлов"
```

```bash
chmod +x bin/fetch-fonts.sh && ./bin/fetch-fonts.sh
```

Если сети нет — пропустить: `fonts.css` отсутствует, страница живёт на fallback-стеке. Коммитим только `fonts.css` (woff2 в .gitignore — при деплое скрипт запускается заново; альтернативно снять ignore, если хочется коммитить бинарники).

- [ ] **Step 2: public/screen.php**

```php
<?php
declare(strict_types=1);
$id = (int)($_GET['id'] ?? 0);
if ($id < 1 || $id > 4) { http_response_code(404); exit('нет такого экрана'); }
?>
<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МОККО · экран <?= $id ?></title>
<link rel="stylesheet" href="/assets/fonts/fonts.css">
<link rel="stylesheet" href="/assets/css/screen.css">
</head>
<body data-screen="<?= $id ?>">
<div id="fit"><div id="stage">
    <div id="vitrine" class="vitrine">
        <video id="vid-a" muted playsinline preload="auto"></video>
        <video id="vid-b" muted playsinline preload="auto"></video>
        <div id="poster" class="poster"></div>
        <div class="scrim"></div>
    </div>
    <header class="tvhead">
        <span class="logo" id="brand">МОККО</span>
        <span class="scr" id="title"></span>
        <span class="clock" id="clock"></span>
    </header>
    <main class="menu" id="menu"></main>
</div></div>
<script src="/assets/js/player.js"></script>
<script src="/assets/js/screen.js"></script>
</body></html>
```

(`player.js` появится в Task 10; до того создать заглушку — Step 4.)

- [ ] **Step 3: public/assets/css/screen.css**

```css
:root {
    --bg0: #120D0A; --bg1: #1C1512;
    --accent: #E9A23B; --accent-hi: #FFC46B;
    --cream: #F4EAD9; --mut: #A89A88;
    --line: rgba(244, 234, 217, .14);
    --disp: 'Unbounded', 'Arial Black', sans-serif;
    --body: 'Manrope', 'Segoe UI', Arial, sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #000; overflow: hidden; cursor: none; }
body { font-family: var(--body); color: var(--cream); }

#fit { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); overflow: hidden; }
#stage { position: absolute; top: 0; left: 0; width: 1920px; height: 1080px;
    transform-origin: 0 0; background: var(--bg0); overflow: hidden; }

/* ---- витрина (видеофон) ---- */
.vitrine { position: absolute; inset: 0; background:
    radial-gradient(90% 70% at 18% 88%, rgba(233, 162, 59, .28), rgba(233, 162, 59, 0) 60%),
    radial-gradient(70% 55% at 30% 60%, rgba(120, 72, 30, .30), rgba(120, 72, 30, 0) 70%),
    linear-gradient(160deg, #1a120c 0%, #120D0A 70%); }
.vitrine video, .vitrine .poster { position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover; opacity: 0; transition: opacity 1s ease; background-size: cover; background-position: center; }
.vitrine video.on, .vitrine .poster.on { opacity: 1; }
.vitrine .scrim { position: absolute; inset: 0; }
body[data-screen="1"] .scrim, body[data-screen="2"] .scrim { background:
    linear-gradient(90deg, rgba(18,13,10,.05) 0%, rgba(18,13,10,.45) 36%, rgba(18,13,10,.92) 48%, rgba(18,13,10,.97) 100%); }
body[data-screen="3"] .scrim, body[data-screen="4"] .scrim { background:
    linear-gradient(90deg, rgba(18,13,10,.05) 0%, rgba(18,13,10,.45) 24%, rgba(18,13,10,.92) 35%, rgba(18,13,10,.97) 100%); }

/* ---- шапка ---- */
.tvhead { position: absolute; top: 0; left: 0; right: 0; height: 120px; padding: 0 64px;
    display: flex; align-items: center; gap: 28px; border-bottom: 1px solid var(--line);
    background: linear-gradient(180deg, rgba(18,13,10,.9), rgba(18,13,10,.35)); }
.logo { font-family: var(--disp); font-weight: 700; font-size: 34px; letter-spacing: .1em; color: var(--accent); }
.scr { font-family: var(--disp); font-weight: 600; font-size: 40px; margin-left: 24px; }
.clock { margin-left: auto; font-size: 30px; font-weight: 600; color: var(--mut);
    font-variant-numeric: tabular-nums; }

/* ---- меню ---- */
.menu { position: absolute; top: 120px; bottom: 0; right: 0;
    padding: 48px 64px 64px 40px; display: grid; grid-template-columns: 1fr 1fr;
    column-gap: 56px; align-content: start; overflow: hidden; }
body[data-screen="1"] .menu, body[data-screen="2"] .menu { left: 44%; }
body[data-screen="3"] .menu, body[data-screen="4"] .menu { left: 32%; }
.menu.swap { animation: fadein .6s ease; }
@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }

.cat { margin-bottom: 40px; }
.cat h3 { font-family: var(--disp); font-weight: 500; font-size: 40px; color: var(--accent);
    margin: 0 0 6px; }
.cat .rule { height: 2px; background: linear-gradient(90deg, var(--accent), transparent 70%);
    opacity: .5; margin-bottom: 20px; }
.item { display: flex; align-items: baseline; gap: 14px; margin-bottom: 18px; }
.item .nm { font-size: 32px; font-weight: 600; line-height: 1.2; }
.item .vol { display: block; font-size: 20px; font-weight: 500; color: var(--mut); margin-top: 2px; }
.item .desc { display: block; font-size: 21px; font-weight: 400; color: var(--mut);
    line-height: 1.35; max-width: 30ch; }
.item .dots { flex: 1; border-bottom: 3px dotted rgba(168, 154, 136, .5);
    transform: translateY(-8px); min-width: 30px; }
.item .pr { font-size: 34px; font-weight: 700; color: var(--accent); white-space: nowrap;
    font-variant-numeric: tabular-nums; min-width: 150px; text-align: right;
    transition: opacity .4s; }
.pr.flash { animation: flash 1.5s ease-out; }
@keyframes flash {
    0% { color: var(--accent-hi); text-shadow: 0 0 26px rgba(255, 196, 107, .8); }
    100% { color: var(--accent); text-shadow: none; }
}

/* ---- компактный режим при переполнении ---- */
#stage.compact .item .nm { font-size: 28px; }
#stage.compact .item .desc { font-size: 19px; }
#stage.compact .item .pr { font-size: 30px; }
#stage.compact .item { margin-bottom: 12px; }
#stage.compact .cat { margin-bottom: 28px; }
#stage.compact .cat h3 { font-size: 34px; }

@media (prefers-reduced-motion: reduce) {
    .menu.swap { animation: none; }
    .pr.flash { animation: none; }
}
```

- [ ] **Step 4: public/assets/js/player.js — заглушка** (реализация в Task 10; контракт уже финальный)

```js
window.MokkoPlayer = function (opts) {
    'use strict';
    return {
        start: function () {
            if (opts.poster) {
                opts.posterEl.style.backgroundImage = 'url(' + opts.poster + ')';
                opts.posterEl.classList.add('on');
            }
        },
        stop: function () {}
    };
};
```

- [ ] **Step 5: public/assets/js/screen.js (первая версия: фит, часы, разовая загрузка и рендер)**

```js
(function () {
    'use strict';
    var screenId = Number(document.body.dataset.screen);
    var stage = document.getElementById('stage');
    var fit = document.getElementById('fit');
    var menuEl = document.getElementById('menu');
    var titleEl = document.getElementById('title');
    var brandEl = document.getElementById('brand');
    var clockEl = document.getElementById('clock');
    var CACHE_KEY = 'mokko-screen-' + screenId;
    var current = null;
    var player = null;
    var mediaKey = null;

    function fitStage() {
        var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        fit.style.width = (1920 * s) + 'px';
        fit.style.height = (1080 * s) + 'px';
        stage.style.transform = 'scale(' + s + ')';
    }
    window.addEventListener('resize', fitStage);
    fitStage();

    function tickClock() {
        var d = new Date();
        clockEl.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
    tickClock();
    setInterval(tickClock, 15000);

    function priceText(prices) {
        return prices.map(function (p) { return p === null ? '—' : String(p); }).join(' / ');
    }

    function render(payload) {
        titleEl.textContent = payload.menu.title;
        brandEl.textContent = payload.settings.brand;
        document.title = payload.settings.brand + ' · ' + payload.menu.title;
        var cols = { 1: document.createElement('div'), 2: document.createElement('div') };
        payload.menu.categories.forEach(function (c) {
            var cat = document.createElement('section');
            cat.className = 'cat';
            var h = document.createElement('h3'); h.textContent = c.title;
            var rule = document.createElement('div'); rule.className = 'rule';
            cat.appendChild(h); cat.appendChild(rule);
            c.items.forEach(function (it) {
                if (!it.visible) return;
                var row = document.createElement('div'); row.className = 'item';
                var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = it.name;
                if (it.volume) { var v = document.createElement('span'); v.className = 'vol'; v.textContent = it.volume; nm.appendChild(v); }
                if (it.desc) { var ds = document.createElement('span'); ds.className = 'desc'; ds.textContent = it.desc; nm.appendChild(ds); }
                var dots = document.createElement('span'); dots.className = 'dots';
                var pr = document.createElement('span'); pr.className = 'pr';
                pr.dataset.itemId = it.id;
                pr.textContent = priceText(it.prices);
                row.appendChild(nm); row.appendChild(dots); row.appendChild(pr);
                cat.appendChild(row);
            });
            cols[c.col === 2 ? 2 : 1].appendChild(cat);
        });
        menuEl.innerHTML = '';
        menuEl.appendChild(cols[1]);
        menuEl.appendChild(cols[2]);
        stage.classList.remove('compact');
        if (menuEl.scrollHeight > menuEl.clientHeight) stage.classList.add('compact');
    }

    function setupMedia(payload) {
        var m = payload.menu.media || { videos: [], poster: '' };
        var key = JSON.stringify(m);
        if (key === mediaKey) return;
        mediaKey = key;
        if (player) player.stop();
        player = window.MokkoPlayer({
            videos: (m.videos || []).map(function (v) { return '/assets/video/' + v; }),
            poster: m.poster ? '/assets/img/' + m.poster : '',
            a: document.getElementById('vid-a'),
            b: document.getElementById('vid-b'),
            posterEl: document.getElementById('poster')
        });
        player.start();
    }

    function applyPayload(payload) {
        render(payload);
        current = payload;
        setupMedia(payload);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch (e) {}
    }

    fetch('/api/menu.php?screen=' + screenId, { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(applyPayload)
        .catch(function () {
            try {
                var cached = localStorage.getItem(CACHE_KEY);
                if (cached) applyPayload(JSON.parse(cached));
            } catch (e) {}
        });
})();
```

- [ ] **Step 6: проверить визуально все 4 экрана**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080/screen.php?id=1"  # 200
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080/screen.php?id=5"  # 404
```

Открыть в браузере `http://localhost:8080/screen.php?id=1…4`: холст 16:9 по центру,
шапка «МОККО · <тема> · часы», две колонки, цены «—», категории по своим колонкам,
шрифты Unbounded/Manrope (если fonts.css скачан). Ужать окно — холст масштабируется.

- [ ] **Step 7: Commit**

```bash
git add public/screen.php public/assets/css/screen.css public/assets/js/screen.js public/assets/js/player.js bin/fetch-fonts.sh public/assets/fonts/fonts.css
git commit -m "feat: страница экрана с рендером меню и дизайн-системой"
```

---

### Task 9: Поллинг, анимация цены, суточная перезагрузка

**Files:**
- Modify: `public/assets/js/screen.js`

**Interfaces:**
- Consumes: ETag из Task 5, DOM из Task 8.
- Produces: цикл `poll()` c `If-None-Match`; `signature(payload)` (структура без цен); точечное обновление `.pr[data-item-id]` с флешем; полный ререндер с классом `swap` при смене структуры; перезагрузка в `settings.reload_at`.

- [ ] **Step 1: заменить хвост screen.js** — убрать разовый `fetch(...)` в конце файла и добавить (внутри той же IIFE):

```js
    var etag = null;
    var pollTimer = null;
    var startedAt = Date.now();

    function signature(payload) {
        return JSON.stringify(payload.menu.categories.map(function (c) {
            return [c.id, c.title, c.col, c.items.filter(function (i) { return i.visible; })
                .map(function (i) { return [i.id, i.name, i.desc, i.volume]; })];
        }));
    }

    function updatePrices(payload) {
        payload.menu.categories.forEach(function (c) {
            c.items.forEach(function (it) {
                if (!it.visible) return;
                var el = menuEl.querySelector('.pr[data-item-id="' + it.id + '"]');
                var txt = priceText(it.prices);
                if (el && el.textContent !== txt) {
                    el.style.opacity = '0';
                    setTimeout(function () {
                        el.textContent = txt;
                        el.style.opacity = '1';
                        el.classList.remove('flash');
                        void el.offsetWidth;
                        el.classList.add('flash');
                    }, 400);
                }
            });
        });
    }

    function applyPayload(payload) {   // ЗАМЕНЯЕТ версию из Task 8
        if (current && signature(current) === signature(payload)) {
            updatePrices(payload);
        } else {
            render(payload);
            if (current) {
                menuEl.classList.remove('swap');
                void menuEl.offsetWidth;
                menuEl.classList.add('swap');
            }
        }
        current = payload;
        setupMedia(payload);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch (e) {}
    }

    function schedule() {
        var sec = (current && current.settings.poll_seconds) || 60;
        clearTimeout(pollTimer);
        pollTimer = setTimeout(poll, sec * 1000);
    }

    function poll() {
        var headers = etag ? { 'If-None-Match': etag } : {};
        fetch('/api/menu.php?screen=' + screenId, { headers: headers, cache: 'no-store' })
            .then(function (r) {
                if (r.status === 304) return null;
                if (!r.ok) throw new Error(r.status);
                etag = r.headers.get('ETag');
                return r.json();
            })
            .then(function (payload) { if (payload) applyPayload(payload); })
            .catch(function () {
                if (!current) {
                    try {
                        var cached = localStorage.getItem(CACHE_KEY);
                        if (cached) applyPayload(JSON.parse(cached));
                    } catch (e) {}
                }
            })
            .then(schedule);
    }
    poll();

    setInterval(function () {
        if (!current) return;
        var d = new Date();
        var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        if (hm === current.settings.reload_at && Date.now() - startedAt > 120000) location.reload();
    }, 60000);
```

- [ ] **Step 2: проверить живое обновление цены**

Открыть `http://localhost:8080/screen.php?id=1`. В соседнем терминале:

```bash
docker compose exec web php -r '
require "/var/www/lib/storage.php";
$d = load_json("screen-1.json");
$d["categories"][0]["items"][3]["prices"] = [230, 270];  // капучино
save_json_atomic("screen-1.json", $d);
echo "ok\n";'
```

В течение poll_seconds (60 c; для теста можно временно поставить 5 в
`data/settings.json`) цена капучино должна смениться с фейдом и янтарной
вспышкой, без перерисовки остального. Вернуть `poll_seconds: 60`.

- [ ] **Step 3: проверить смену структуры** — тем же способом переименовать позицию:
меню перерисовывается целиком с мягким fade-in (класс `swap`).

- [ ] **Step 4: Commit**

```bash
git add public/assets/js/screen.js
git commit -m "feat: поллинг с etag, анимация смены цены, суточная перезагрузка"
```

---

### Task 10: Видеоплеер с бесшовным лупом

**Files:**
- Modify: `public/assets/js/player.js` (заменить заглушку целиком)

**Interfaces:**
- Consumes: DOM `#vid-a`, `#vid-b`, `#poster`; вызов из `setupMedia` (Task 8).
- Produces: `window.MokkoPlayer(opts) → {start(), stop()}`; opts: `{videos: string[], poster: string, a: HTMLVideoElement, b: HTMLVideoElement, posterEl: HTMLElement}`. Поведение: плейлист по кругу, кроссфейд 1 с (CSS `.on`), фолбэк на постер при ошибке/таймауте 4 с/запрете автоплея; пустой список → постер/градиент.

- [ ] **Step 1: public/assets/js/player.js**

```js
window.MokkoPlayer = function (opts) {
    'use strict';
    var vids = opts.videos || [];
    var a = opts.a, b = opts.b, posterEl = opts.posterEl;
    var idx = 0, active = null, switching = false, stopped = false;

    function showPoster() {
        stopped = true;
        if (opts.poster) posterEl.style.backgroundImage = 'url(' + opts.poster + ')';
        posterEl.classList.add('on');
        a.classList.remove('on');
        b.classList.remove('on');
        a.removeAttribute('src');
        b.removeAttribute('src');
    }

    function swapTo(el) {
        var other = el === a ? b : a;
        el.classList.add('on');
        other.classList.remove('on');
        active = el;
        switching = false;
    }

    function playNext() {
        if (stopped) return;
        switching = true;
        var el = active === a ? b : a;
        var src = vids[idx % vids.length];
        idx++;
        var done = false;
        var fail = function () { if (!done) { done = true; showPoster(); } };
        var t = setTimeout(fail, 4000);
        el.onerror = fail;
        el.oncanplay = function () {
            if (done) return;
            done = true;
            clearTimeout(t);
            var p = el.play();
            if (p && p.catch) p.then(function () { swapTo(el); }).catch(fail);
            else swapTo(el);
        };
        el.onended = function () { if (!switching && !stopped) playNext(); };
        el.src = src;
        el.load();
    }

    function tick() {
        if (stopped || !active || switching) return;
        if (active.duration && active.duration - active.currentTime < 1.2) playNext();
    }

    return {
        start: function () {
            if (!vids.length) { showPoster(); return; }
            [a, b].forEach(function (el) { el.addEventListener('timeupdate', tick); });
            playNext();
        },
        stop: function () {
            stopped = true;
            [a, b].forEach(function (el) {
                el.removeEventListener('timeupdate', tick);
                el.pause();
                el.removeAttribute('src');
            });
        }
    };
};
```

Замечание: `showPoster` при пустом `opts.poster` просто гасит видео — остаётся
градиентная витрина из CSS, это штатный вид до готовности ассетов Grok.

- [ ] **Step 2: проверить фолбэк без видео** — `http://localhost:8080/screen.php?id=1`:
витрина показывает янтарный градиент, ошибок в консоли нет.

- [ ] **Step 3: проверить с реальным роликом** (любой короткий mp4; если есть сеть, взять маленький тестовый файл, иначе положить любой свой):

```bash
curl -sfL -o public/assets/video/test-a.mp4 https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4 || echo "положите свой mp4 в public/assets/video/test-a.mp4"
docker compose exec web php -r '
require "/var/www/lib/storage.php";
$d = load_json("screen-1.json");
$d["media"]["videos"] = ["test-a.mp4"];
save_json_atomic("screen-1.json", $d);'
```

Обновить экран: видео крутится в лупе, на стыке — плавный кроссфейд (один и
тот же файл чередуется между двумя `<video>`). Затем вернуть:

```bash
docker compose exec web php -r '
require "/var/www/lib/storage.php";
$d = load_json("screen-1.json");
$d["media"]["videos"] = [];
save_json_atomic("screen-1.json", $d);'
rm -f public/assets/video/test-a.mp4
```

- [ ] **Step 4: Commit**

```bash
git add public/assets/js/player.js
git commit -m "feat: видеоплеер с кроссфейдом лупа и фолбэком на постер"
```

---

### Task 11: Админка — обзор и редактор экрана

**Files:**
- Create: `public/admin/index.php`, `public/admin/screen.php`, `public/assets/js/admin.js`
- Modify: `public/assets/css/admin.css` (дополнить стилями редактора)

**Interfaces:**
- Consumes: `require_admin_page`, `csrf_token` (Task 6), `load_json_with_fallback` (Task 2), `POST /api/save.php` (Task 7).
- Produces: страницы `/admin/` и `/admin/screen.php?id=N`; в редакторе глобальные `window.SCREEN_DATA` (JSON экрана) и `window.CSRF`.

- [ ] **Step 1: public/admin/index.php**

```php
<?php
declare(strict_types=1);
require __DIR__ . '/../../lib/auth.php';
require __DIR__ . '/../../lib/storage.php';
require_admin_page();
$screens = [];
for ($i = 1; $i <= 4; $i++) {
    $d = load_json_with_fallback("screen-$i.json");
    $count = 0;
    foreach (($d['categories'] ?? []) as $c) $count += count($c['items'] ?? []);
    $screens[$i] = ['title' => $d['title'] ?? "Экран $i", 'count' => $count, 'updated' => $d['updated_at'] ?? ''];
}
?>
<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МОККО · админка</title>
<link rel="stylesheet" href="/assets/css/admin.css"></head>
<body class="admin">
<header class="topbar">
    <b>МОККО · админка</b>
    <a href="/admin/logout.php">выйти</a>
</header>
<main class="cards">
<?php foreach ($screens as $i => $s): ?>
    <a class="scard" href="/admin/screen.php?id=<?= $i ?>">
        <span class="num"><?= $i ?></span>
        <b><?= htmlspecialchars($s['title']) ?></b>
        <span class="meta"><?= $s['count'] ?> позиций · обновлено <?= htmlspecialchars(substr($s['updated'], 0, 16)) ?></span>
    </a>
<?php endforeach; ?>
</main>
</body></html>
```

- [ ] **Step 2: public/admin/screen.php**

```php
<?php
declare(strict_types=1);
require __DIR__ . '/../../lib/auth.php';
require __DIR__ . '/../../lib/storage.php';
require_admin_page();
$id = (int)($_GET['id'] ?? 0);
if ($id < 1 || $id > 4) { http_response_code(404); exit('нет такого экрана'); }
$data = load_json_with_fallback("screen-$id.json");
if ($data === null) { http_response_code(500); exit('данные не читаются'); }
$json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP);
?>
<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>МОККО · <?= htmlspecialchars($data['title']) ?></title>
<link rel="stylesheet" href="/assets/css/admin.css"></head>
<body class="admin">
<header class="topbar">
    <a href="/admin/">← экраны</a>
    <b><?= htmlspecialchars($data['title']) ?></b>
    <a href="/screen.php?id=<?= $id ?>" target="_blank">посмотреть экран ↗</a>
</header>
<main id="editor"></main>
<footer class="savebar">
    <span id="msg"></span>
    <button id="save" type="button">Сохранить</button>
</footer>
<script>
window.SCREEN_DATA = <?= $json ?>;
window.CSRF = <?= json_encode(csrf_token()) ?>;
</script>
<script src="/assets/js/admin.js"></script>
</body></html>
```

- [ ] **Step 3: public/assets/js/admin.js**

```js
(function () {
    'use strict';
    var data = window.SCREEN_DATA;
    var root = document.getElementById('editor');
    var msg = document.getElementById('msg');
    var LIMITS = { 1: 10, 2: 10, 3: 9, 4: 9 };

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }
    function input(value, cls, placeholder) {
        var i = el('input', cls);
        i.value = value == null ? '' : value;
        i.placeholder = placeholder || '';
        return i;
    }

    function renderItem(cat, it, ii) {
        var row = el('div', 'row' + (it.visible ? '' : ' off'));
        var name = input(it.name, 'f-name', 'название');
        name.oninput = function () { it.name = name.value; };
        var desc = input(it.desc, 'f-desc', 'состав');
        desc.oninput = function () { it.desc = desc.value; };
        var vol = input(it.volume, 'f-vol', 'объём');
        vol.oninput = function () { it.volume = vol.value; };
        var p1 = input(it.prices[0], 'f-price', '₽');
        p1.type = 'number'; p1.min = '0';
        p1.oninput = function () { it.prices[0] = p1.value === '' ? null : Number(p1.value); };
        var p2 = input(it.prices.length > 1 ? it.prices[1] : '', 'f-price', '₽ · 2-й объём');
        p2.type = 'number'; p2.min = '0';
        p2.oninput = function () {
            if (p2.value === '') it.prices = [it.prices[0] === undefined ? null : it.prices[0]];
            else it.prices[1] = Number(p2.value);
        };
        var vis = el('button', 'tgl', it.visible ? 'скрыть' : 'показать');
        vis.type = 'button';
        vis.onclick = function () { it.visible = !it.visible; render(); };
        var up = el('button', 'mv', '↑');
        up.type = 'button';
        up.onclick = function () { if (ii > 0) { cat.items.splice(ii - 1, 0, cat.items.splice(ii, 1)[0]); render(); } };
        var dn = el('button', 'mv', '↓');
        dn.type = 'button';
        dn.onclick = function () { if (ii < cat.items.length - 1) { cat.items.splice(ii + 1, 0, cat.items.splice(ii, 1)[0]); render(); } };
        var del = el('button', 'del', '✕');
        del.type = 'button';
        del.onclick = function () {
            if (confirm('Удалить «' + (it.name || 'позицию') + '»?')) { cat.items.splice(ii, 1); render(); }
        };
        [name, desc, vol, p1, p2, vis, up, dn, del].forEach(function (x) { row.appendChild(x); });
        return row;
    }

    function render() {
        root.innerHTML = '';
        data.categories.forEach(function (cat) {
            var box = el('section', 'catbox');
            var head = el('div', 'cathead');
            var t = input(cat.title, 'cat-title');
            t.oninput = function () { cat.title = t.value; };
            head.appendChild(t);
            var warn = el('span', 'count', cat.items.length + ' поз.');
            if (cat.items.length > (LIMITS[data.screen] || 10)) {
                warn.classList.add('over');
                warn.textContent += ' — многовато, может не влезть';
            }
            head.appendChild(warn);
            box.appendChild(head);
            cat.items.forEach(function (it, ii) { box.appendChild(renderItem(cat, it, ii)); });
            var add = el('button', 'add', '+ позиция');
            add.type = 'button';
            add.onclick = function () {
                cat.items.push({ id: 'item-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                    name: '', desc: '', volume: '', prices: [null], visible: true });
                render();
            };
            box.appendChild(add);
            root.appendChild(box);
        });
    }

    document.getElementById('save').onclick = function () {
        msg.textContent = 'сохраняю…';
        msg.className = '';
        fetch('/api/save.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.CSRF },
            body: JSON.stringify(data)
        }).then(function (r) {
            return r.json().then(function (j) { return { s: r.status, j: j }; });
        }).then(function (res) {
            if (res.s === 200) { msg.textContent = 'сохранено ✓'; msg.className = 'ok'; }
            else {
                msg.textContent = 'ошибка: ' + (res.j.errors ? res.j.errors.join('; ') : res.j.error);
                msg.className = 'err';
            }
        }).catch(function () {
            msg.textContent = 'сеть недоступна';
            msg.className = 'err';
        });
    };

    render();
})();
```

- [ ] **Step 4: дополнить public/assets/css/admin.css**

```css
/* ---- админка: каркас ---- */
.topbar { display: flex; align-items: center; gap: 16px; padding: 14px 20px;
    background: var(--panel); border-bottom: 1px solid var(--line);
    position: sticky; top: 0; }
.topbar a { color: var(--accent); text-decoration: none; }
.topbar b { flex: 1; text-align: center; }

.cards { display: grid; gap: 14px; padding: 20px; max-width: 640px; margin: 0 auto; }
.scard { display: grid; grid-template-columns: 48px 1fr; grid-auto-rows: min-content;
    gap: 2px 14px; align-items: center; background: var(--panel);
    border: 1px solid var(--line); border-radius: 12px; padding: 18px;
    color: var(--text); text-decoration: none; }
.scard .num { grid-row: span 2; font-size: 28px; font-weight: 800; color: var(--accent);
    text-align: center; }
.scard .meta { color: var(--mut); font-size: 14px; }

/* ---- редактор ---- */
#editor { padding: 16px; max-width: 1100px; margin: 0 auto 80px; }
.catbox { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
    padding: 14px; margin-bottom: 18px; }
.cathead { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.cat-title { flex: 1; font-size: 18px; font-weight: 700; padding: 8px 12px;
    border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--accent); }
.count { color: var(--mut); font-size: 13px; white-space: nowrap; }
.count.over { color: var(--err); }
.row { display: grid; grid-template-columns: 1.2fr 2fr .7fr .6fr .6fr auto auto auto auto;
    gap: 8px; margin-bottom: 8px; align-items: center; }
.row.off { opacity: .45; }
.row input { padding: 9px 10px; border-radius: 8px; border: 1px solid var(--line);
    background: var(--bg); color: var(--text); min-width: 0; }
.row .tgl, .row .mv, .row .del, .add { padding: 9px 10px; border-radius: 8px;
    border: 1px solid var(--line); background: var(--bg); color: var(--mut); }
.row .del { color: var(--err); }
.add { margin-top: 4px; color: var(--accent); }
.savebar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; gap: 16px;
    align-items: center; justify-content: flex-end; padding: 12px 20px;
    background: var(--panel); border-top: 1px solid var(--line); }
.savebar button { background: var(--accent); border: none; color: #1a1208;
    font-weight: 700; padding: 12px 28px; border-radius: 8px; }
@media (max-width: 800px) {
    .row { grid-template-columns: 1fr 1fr; }
    .row .f-desc { grid-column: span 2; }
}
```

- [ ] **Step 5: проверить сквозной сценарий вручную**

1. `http://localhost:8080/admin/` без сессии → редирект на login. Войти `mokko2026`.
2. Открыть «Экран 1», проставить цену капучино 230/270, «Сохранить» → «сохранено ✓».
3. `curl -s "http://localhost:8080/api/menu.php?screen=1" | grep -o '230'` → цена в API.
4. Открыть экран 1 в соседней вкладке → в течение poll-интервала цена подтянулась с вспышкой.
5. «Скрыть» позицию → сохранить → позиция пропала с экрана (структурный ререндер).
6. Добавить позицию с пустым именем → «Сохранить» → видимая ошибка валидации, форма не потерялась.

- [ ] **Step 6: все тесты по-прежнему зелёные** (`docker compose exec web php /var/www/tests/run.php`).

- [ ] **Step 7: Commit**

```bash
git add public/admin/index.php public/admin/screen.php public/assets/js/admin.js public/assets/css/admin.css
git commit -m "feat: админка — обзор экранов и редактор позиций"
```

---

### Task 12: README, финальный прогон, чек-лист

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: всё выше.

- [ ] **Step 1: README.md**

```markdown
# МОККО — анимированное TV-меню

4 экрана 16:9 (`/screen.php?id=1..4`) + админка (`/admin/`). PHP 8.3, без БД:
данные в `data/*.json`. Спецификация — `docs/superpowers/specs/`, дизайн —
`docs/design-system.md`, промты графики — `docs/grok-prompts.md`.

## Запуск локально

    docker compose up -d
    open http://localhost:8080/

Пароль админки по умолчанию: `mokko2026`. Сменить:

    docker compose exec web php /var/www/bin/set-password.php НОВЫЙ_ПАРОЛЬ

Шрифты (однократно, нужна сеть): `./bin/fetch-fonts.sh`

## Тесты

    docker compose exec web php /var/www/tests/run.php

## Ролики и постеры (Grok)

1. Сгенерировать по промтам из `docs/grok-prompts.md`.
2. Положить mp4 в `public/assets/video/`, постеры в `public/assets/img/`.
3. Прописать имена файлов в `data/screen-N.json` → `media.videos` / `media.poster`.
   Экран подхватит на очередном поллинге. Без роликов витрина показывает
   фирменный градиент — это штатно.

## Деплой на хостинг

- Залить проект; docroot веб-сервера → `public/`.
- `data/` должна быть вне docroot и доступна PHP на запись.
- Запустить `bin/fetch-fonts.sh` (или залить `assets/fonts/` целиком).
- Задать пароль админки. Отдать владельцу 4 ссылки на экраны и ссылку на админку.

## Экраны у владельца

На каждом ТВ открыть свою ссылку в полноэкранном режиме браузера. Экран сам
опрашивает сервер (раз в 60 с), сам перезагружается ночью (04:00) и переживает
обрывы сети (кэш последнего меню).
```

- [ ] **Step 2: полный прогон тестов + чек-лист**

```bash
docker compose exec web php /var/www/tests/run.php   # 0 failed
```

Чек-лист вручную (все пункты должны пройти):
- [ ] 4 экрана открываются, категории в правильных колонках, «—» у пустых цен.
- [ ] Масштабирование окна не ломает пропорции холста.
- [ ] Смена цены из админки доезжает без перезагрузки, с вспышкой.
- [ ] Скрытие/добавление/удаление позиции доезжает (полный ререндер с fade).
- [ ] Останов контейнера → экран продолжает показывать последнее меню; после
      `docker compose start` поллинг оживает сам.
- [ ] Перезагрузка страницы при выключенном сервере → меню из localStorage.
- [ ] Логин/логаут, неверный пароль, прямой заход на /admin/ без сессии.
- [ ] `data/backups/` содержит бэкапы после сохранений.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: readme — запуск, тесты, деплой"
```
