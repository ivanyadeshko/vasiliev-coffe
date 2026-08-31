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
