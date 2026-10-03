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
function test_validate_desc_multiline_ok(): void {
    // оператор переносит состав на новую строку Enter'ом в админке
    $d = valid_screen_fixture();
    $d['categories'][0]['items'][0]['desc'] = "эспрессо, молоко\nсироп на выбор";
    check_eq(validate_screen($d), [], 'перевод строки в описании допустим');
}
