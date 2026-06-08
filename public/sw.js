// public/sw.js
self.addEventListener('push', function (event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Notification';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png', // adjust path as needed
    badge: '/badge-72.png',
    data: {
      url: data.url || '/',
      actionData: data.actionData || null,
      notificationId: data.notificationId
    },
    actions: data.actions || [] // [{action: 'approve', title: 'Approve'}, ...]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const clickData = event.notification.data;
  const action = event.action; // if user clicked an action button
  let fetchPromise = Promise.resolve();
  if (action) {
    // Quick action: send to backend
    const url = `/api/requests/action`;
    const payload = {
      requestId: clickData.actionData?.requestId,
      action: action,
      approverId: clickData.actionData?.approverId
    };
    fetchPromise = fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
  // Focus or open the related page
  const openUrl = clickData.url || '/';
  const clientPromise = clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(windowClients => {
      for (const client of windowClients) {
        if (client.url === openUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(openUrl);
      }
    });
  event.waitUntil(Promise.all([fetchPromise, clientPromise]));
});
