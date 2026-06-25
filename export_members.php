<?php
/**
 * file: export_members.php
 * author: Iya
 * date: June 25, 2026
 * purpose: Collects the complete active employee registry roster from the database system and outputs it cleanly into a secure, downloadable CSV dataset.
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ── DB CONFIG ────────────────────────────────────────────────
$host   = 'localhost';
$dbname = 'stlaf_db';       // ← change to your DB name
$user   = 'root';           // ← change to your DB user
$pass   = '';               // ← change to your DB password
$port   = 3306;

try {
    $pdo = new PDO(
        "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4",
        $user,
        $pass,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed: ' . $e->getMessage()]);
    exit;
}

// ── QUERY ────────────────────────────────────────────────────
// Adjust column/table names to match your actual schema.
// NOTE: password / password_hash columns are intentionally excluded.
$sql = "
    SELECT
        id_number,
        name,
        department,
        position,
        role,
        CASE
            WHEN status IS NULL OR status = '' THEN 'Active'
            ELSE status
        END AS account_status,
        created_at
    FROM users
    ORDER BY department ASC, name ASC
";

try {
    $stmt = $pdo->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Query failed: ' . $e->getMessage()]);
    exit;
}

// ── CSV OUTPUT ───────────────────────────────────────────────
$filename = 'members_' . date('Ymd') . '.csv';

header('Content-Type: text/csv; charset=UTF-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

// UTF-8 BOM so Excel opens correctly
echo "\xEF\xBB\xBF";

$out = fopen('php://output', 'w');

// Header row
fputcsv($out, [
    'ID Number',
    'Full Name',
    'Department',
    'Position',
    'Role',
    'Account Status',
    'Date Created',
]);

// Data rows
foreach ($rows as $row) {
    fputcsv($out, [
        $row['id_number']       ?? '',
        $row['name']            ?? '',
        $row['department']      ?? '',
        $row['position']        ?? '',
        $row['role']            ?? '',
        $row['account_status']  ?? 'Active',
        $row['created_at']      ?? '',
    ]);
}

fclose($out);
exit;
