<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/auth.php';
require_admin_api();
header('Content-Type: text/plain; charset=utf-8');
echo csrf_token();
