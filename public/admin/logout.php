<?php
declare(strict_types=1);
require_once __DIR__ . '/../../lib/auth.php';
auth_boot();
$_SESSION = [];
session_destroy();
header('Location: /admin/login.php');
