/* Background delivery has no dashboard cache and stores no access tokens. */
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Ignore malformed payload. */ }
  event.waitUntil(self.registration.showNotification(data.title || "Academic credential update", {
    body: data.body || "You have a new system notification.",
    tag: data.tag || "credential-update",
    data: { url: "/dashboard?notifications=1" },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL("/dashboard?notifications=1", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    const client = clients.find(item => new URL(item.url).origin === self.location.origin);
    if (client) { await client.navigate(url); return client.focus(); }
    return self.clients.openWindow(url);
  }));
});
