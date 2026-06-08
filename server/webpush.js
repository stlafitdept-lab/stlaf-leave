// server/webpush.js
import webPush from 'web-push';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Load or generate VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

function generateVapidKeys() {
  const keys = webPush.generateVAPIDKeys();
  // Save to .env (append if not present)
  const envPath = path.resolve(process.cwd(), '.env');
  const lines = [];
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of existing) {
      if (!line.startsWith('VAPID_PUBLIC_KEY') && !line.startsWith('VAPID_PRIVATE_KEY')) {
        lines.push(line);
      }
    }
  }
  lines.push(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  lines.push(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
  fs.writeFileSync(envPath, lines.join('\n'));
  return keys;
}

let publicKey = vapidPublicKey;
let privateKey = vapidPrivateKey;

if (!publicKey || !privateKey) {
  const keys = generateVapidKeys();
  publicKey = keys.publicKey;
  privateKey = keys.privateKey;
}

webPush.setVapidDetails(
  'mailto:admin@stlaf.com',
  publicKey,
  privateKey
);

export function getVapidPublicKey() {
  return publicKey;
}

export async function sendNotification(subscription, payload) {
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (err) {
    console.error('Error sending push notification', err);
    return { success: false, error: err };
  }
}
