<?php
/**
 * File: export_requests.php
 * Author: Iya
 * Date: June 25, 2026
 * Purpose: Exports last 3 months of Leave, Overtime, and OB requests.
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

// ── DATE RANGE: last 3 months ────────────────────────────────
$cutoff = date('Y-m-d', strtotime('-3 months'));

// ── QUERY ────────────────────────────────────────────────────
// Adjust table/column names to match your actual schema.
$sql = "
    SELECT
        l.id                                        AS request_id,
        u.name                                      AS employee_name,
        u.department,
        'Leave'                                     AS request_type,
        l.leave_type                                AS sub_type,
        l.created_at                                AS date_filed,
        CONCAT(l.start_date, ' - ', l.end_date)    AS inclusive_dates,
        l.reason,
        l.status,
        l.pay_status,
        COALESCE(a.name, '—')                       AS approver_name
    FROM leaves l
    JOIN users  u ON u.id = l.employee_id
    LEFT JOIN users a ON a.id = l.approver_id
    WHERE l.created_at >= :cutoff

    UNION ALL

    SELECT
        o.id,
        u.name,
        u.department,
        'Overtime',
        NULL,
        o.created_at,
        CONCAT(o.ot_date, ' (', o.hours, ' hrs)'),
        o.reason,
        o.status,
        NULL,
        COALESCE(a.name, '—')
    FROM overtime o
    JOIN users  u ON u.id = o.employee_id
    LEFT JOIN users a ON a.id = o.approver_id
    WHERE o.created_at >= :cutoff

    UNION ALL

    SELECT
        ob.id,
        u.name,
        u.department,
        'Official Business',
        ob.purpose,
        ob.created_at,
        CONCAT(ob.date, ' ', ob.time_in, ' - ', ob.time_out),
        ob.purpose,
        ob.status,
        NULL,
        '—'
    FROM ob_requests ob
    JOIN users u ON u.id = ob.employee_id
    WHERE ob.created_at >= :cutoff

    ORDER BY date_filed DESC
";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->bindValue(':cutoff', $cutoff);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Query failed: ' . $e->getMessage()]);
    exit;
}

// ── CSV OUTPUT ───────────────────────────────────────────────
$filename = 'requests_' . date('Ymd') . '.csv';

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
    'Request ID',
    'Employee Name',
    'Department',
    'Request Type',
    'Sub-Type / Leave Type',
    'Date Filed',
    'Inclusive Dates / Period',
    'Reason',
    'Status',
    'Pay Status',
    'Approver Name',
]);

// Data rows
foreach ($rows as $row) {
    fputcsv($out, [
        $row['request_id']    ?? '',
        $row['employee_name'] ?? '',
        $row['department']    ?? '',
        $row['request_type']  ?? '',
        $row['sub_type']      ?? '',
        $row['date_filed']    ?? '',
        $row['inclusive_dates'] ?? '',
        $row['reason']        ?? '',
        $row['status']        ?? '',
        $row['pay_status']    ?? '',
        $row['approver_name'] ?? '',
    ]);
}

fclose($out);
exit;
