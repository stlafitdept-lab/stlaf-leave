// server/server.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { pool } from './db.js';
import { getVapidPublicKey, sendNotification } from './webpush.js';

dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 4000;

app.use(cors());
app.use(bodyParser.json());

// Helper to get subscription record by endpoint
async function getSubscriptionByEndpoint(endpoint) {
  const [rows] = await pool.query('SELECT * FROM subscriptions WHERE endpoint = ?', [endpoint]);
  return rows[0];
}

// POST /api/subscribe - Save or update subscription
app.post('/api/subscribe', async (req, res) => {
  const { userId, role, subscription } = req.body;
  if (!userId || !role || !subscription) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const { endpoint, keys } = subscription;
  try {
    const existing = await getSubscriptionByEndpoint(endpoint);
    if (existing) {
      await pool.query(
        'UPDATE subscriptions SET user_id = ?, role = ?, p256dh = ?, auth = ? WHERE endpoint = ?',
        [userId, role, keys.p256dh, keys.auth, endpoint]
      );
    } else {
      await pool.query(
        'INSERT INTO subscriptions (user_id, role, endpoint, p256dh, auth) VALUES (?,?,?,?,?)',
        [userId, role, endpoint, keys.p256dh, keys.auth]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Subscribe error', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/notifications?userId=123 - Retrieve notifications for a user
app.get('/api/notifications', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  try {
    const [rows] = await pool.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [userId]);
    res.json(rows);
  } catch (err) {
    console.error('Fetch notifications error', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/notifications/read - Mark notifications as read/unread
app.post('/api/notifications/read', async (req, res) => {
  const { ids, isRead } = req.body; // ids: array of notification IDs
  if (!Array.isArray(ids) || typeof isRead !== 'boolean') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  try {
    await pool.query('UPDATE notifications SET is_read = ? WHERE id IN (?)', [isRead, ids]);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/notifications/trigger - Create DB entry and push to subscriber(s)
app.post('/api/notifications/trigger', async (req, res) => {
  const { userId, title, body, data } = req.body;
  if (!userId || !title || !body) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  try {
    // Insert notification record
    const [result] = await pool.query(
      'INSERT INTO notifications (user_id, title, body, data) VALUES (?,?,?,?)',
      [userId, title, body, JSON.stringify(data || {})]
    );
    // Retrieve subscription(s) for the user
    const [subs] = await pool.query('SELECT * FROM subscriptions WHERE user_id = ?', [userId]);
    const payload = { title, body, data, notificationId: result.insertId };
    // Send push to each subscription
    for (const sub of subs) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      await sendNotification(subscription, payload);
    }
    res.json({ success: true, notificationId: result.insertId });
  } catch (err) {
    console.error('Trigger notification error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/requests/action - Quick approve/reject from notification action
app.post('/api/requests/action', async (req, res) => {
  const { requestId, action, approverId } = req.body; // action: 'approve' | 'reject'
  if (!requestId || !action || !approverId) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  // This endpoint should integrate with existing request handling logic.
  // For now we simply acknowledge; actual DB update logic should be added by the main app.
  console.log(`Quick action received: ${action} request ${requestId} by approver ${approverId}`);
  res.json({ success: true });
});

// Public VAPID key endpoint for client subscription
app.get('/api/vapidPublicKey', (req, res) => {
  res.send(getVapidPublicKey());
});

app.listen(PORT, () => {
  console.log(`Notification server running on port ${PORT}`);
});
