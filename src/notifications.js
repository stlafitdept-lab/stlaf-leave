// src/notifications.js
/**
 * Helper to convert a base64 VAPID public key to a Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Request the browser's push notification permission.
 */
export async function requestPushPermission() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Push notifications permission denied');
  }
  return permission;
}

/**
 * Register the service worker and subscribe the user to push notifications.
 * Sends the subscription object to the backend for persistence.
 */
export async function initPush(userId, role) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser');
  }

  // 1️⃣ Request permission
  await requestPushPermission();

  // 2️⃣ Register service worker (Vite serves files from /public)
  const registration = await navigator.serviceWorker.register('/sw.js');

  // 3️⃣ Get VAPID public key from backend
  const resp = await fetch('/api/vapidPublicKey');
  const vapidPublicKey = await resp.text();

  // 4️⃣ Subscribe (or retrieve existing subscription)
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  // 5️⃣ Send subscription to backend
  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, role, subscription }),
  });

  return subscription;
}

/**
 * Fetch in‑app notifications for a given user.
 */
export async function fetchNotifications(userId) {
  const response = await fetch(`/api/notifications?userId=${encodeURIComponent(userId)}`);
  if (!response.ok) throw new Error('Failed to fetch notifications');
  return await response.json();
}

/**
 * Mark an array of notification IDs as read or unread.
 */
export async function markNotifications(ids, isRead = true) {
  await fetch('/api/notifications/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, isRead }),
  });
}
