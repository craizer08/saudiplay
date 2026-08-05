<?php
header("Content-Type: text/plain; charset=UTF-8");
echo "PHP version: " . phpversion() . "\n";
echo "mysqli loaded: " . (extension_loaded('mysqli') ? 'yes' : 'NO') . "\n";
echo "pdo_mysql loaded: " . (extension_loaded('pdo_mysql') ? 'yes' : 'NO') . "\n";
echo "display_errors: " . ini_get('display_errors') . "\n";
?>
