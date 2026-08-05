<?php
mysqli_report(MYSQLI_REPORT_OFF);
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

// ===== إعدادات قاعدة البيانات (من لوحة تحكم InfinityFree > MySQL) =====
$servername = "sql306.infinityfree.com";
$username   = "if0_42578356";
$password   = "Asdga7sasksa";
$dbname     = "if0_42578356_if0_42578356_movies";
// ======================================================================

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    die(json_encode(["error" => "فشل الاتصال: " . $conn->connect_error], JSON_UNESCAPED_UNICODE));
}

$conn->set_charset("utf8mb4");

$conn->query("CREATE TABLE IF NOT EXISTS episodes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  episode_number VARCHAR(100),
  category VARCHAR(100),
  poster_url TEXT,
  video_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$sql = "SELECT id, title, episode_number, category, poster_url, video_url FROM episodes ORDER BY id DESC";
$result = $conn->query($sql);

$movies = [];
if ($result && $result->num_rows > 0) {
    while ($row = $result->fetch_assoc()) {
        $movies[] = $row;
    }
}

echo json_encode($movies, JSON_UNESCAPED_UNICODE);
$conn->close();
?>
