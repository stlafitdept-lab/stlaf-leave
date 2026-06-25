<?php
/**
 * file: export_data.php
 * author: Iya
 * date: June 25, 2026
 * purpose: Authenticates database connections and exports structured category tables filtered by date intervals.
 */
include 'cors.php';
include 'db_config.php';

$host   = 'bchbyrvggka3okcjwmwv-mysql.services.clever-cloud.com';
$dbname = 'bchbyrvggka3okcjwmwv';
$dbuser = 'usdkgqrlhm5iiwtk';
$dbpass = 'dKzvf9Ns0GxUH041q5Hd';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db_name", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    echo json_encode(["error" => "Connection failed: " . $e->getMessage()]);
    exit;
}

$category = $_GET['category'] ?? '';
$start_date = $_GET['start_date'] ?? '';
$end_date = $_GET['end_date'] ?? '';

if (!$category || !$start_date || !$end_date) {
    echo json_encode(["error" => "Missing parameters"]);
    exit;
}

// Map categories to table names and date columns
$config = [
    'leave' => ['table' => 'leaves', 'date_col' => 'date_requested'],
    'overtime' => ['table' => 'overtimes', 'date_col' => 'ot_date'],
    'ob' => ['table' => 'official_business', 'date_col' => 'ob_date']
];

if (!array_key_exists($category, $config)) {
    echo json_encode(["error" => "Invalid category"]);
    exit;
}

$table = $config[$category]['table'];
$date_col = $config[$category]['date_col'];

try {
    // SQL Query with Date Filtering
    $sql = "SELECT * FROM $table WHERE $date_col BETWEEN ? AND ? ORDER BY $date_col DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$start_date, $end_date]);
    
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if ($results) {
        echo json_encode($results);
    } else {
        echo json_encode(["message" => "No records found for this period", "data" => []]);
    }
} catch(PDOException $e) {
    echo json_encode(["error" => $e->getMessage()]);
}
?>