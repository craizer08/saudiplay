<?php
ini_set('display_errors', '1');
error_reporting(E_ALL);
header("Content-Type: text/plain; charset=UTF-8");

$servername = "sql306.infinityfree.com";
$username   = "if0_42578356";
$password   = "Asdga7sasksa";
$dbname     = "if0_42578356_if0_42578356_movies";

echo "Testing DB connection...\n";
$conn = @new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
    echo "CONNECT ERROR: " . $conn->connect_error . "\n";
} else {
    echo "CONNECT OK\n";
    $conn->set_charset("utf8mb4");
    $result = $conn->query("SELECT id, title, episode_number, category, poster_url, video_url FROM episodes ORDER BY id DESC");
    if ($result) {
        $movies = [];
        while ($row = $result->fetch_assoc()) { $movies[] = $row; }
        echo "RESULT OK. Count: " . count($movies) . "\n";
        echo json_encode($movies, JSON_UNESCAPED_UNICODE) . "\n";
    } else {
        echo "QUERY ERROR: " . $conn->error . "\n";
    }
    $conn->close();
}
echo "\nDONE\n";
?>
