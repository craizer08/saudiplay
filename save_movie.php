<?php
mysqli_report(MYSQLI_REPORT_OFF);
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ===== إعدادات قاعدة البيانات (من لوحة تحكم InfinityFree > MySQL) =====
$servername = "sql306.infinityfree.com";
$username   = "if0_42578356";
$password   = "Asdga7sasksa";
$dbname     = "if0_42578356_if0_42578356_movies";
// ======================================================================

$conn = new mysqli($servername, $username, $password, $dbname);

if ($conn->connect_error) {
    die(json_encode(["status" => "error", "message" => "فشل الاتصال: " . $conn->connect_error], JSON_UNESCAPED_UNICODE));
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

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $title    = trim($_POST['title'] ?? '');
    $episode  = trim($_POST['episode'] ?? '');
    $category = trim($_POST['category'] ?? '');
    $poster   = trim($_POST['poster'] ?? '');
    $video    = trim($_POST['video_url'] ?? '');

    if (!empty($title) && !empty($video)) {
        $stmt = $conn->prepare("INSERT INTO episodes (title, episode_number, category, poster_url, video_url) VALUES (?, ?, ?, ?, ?)");
        $stmt->bind_param("sssss", $title, $episode, $category, $poster, $video);

        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "message" => "تم نشر الحلقة بنجاح!"], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode(["status" => "error", "message" => "خطأ أثناء الحفظ: " . $stmt->error], JSON_UNESCAPED_UNICODE);
        }
        $stmt->close();
    } else {
        echo json_encode(["status" => "error", "message" => "يرجى ملء الحقول المطلوبة"], JSON_UNESCAPED_UNICODE);
    }
}
$conn->close();
?>
