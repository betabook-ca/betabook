// Betabook service worker: friend send alerts only. It has no fetch handler,
// so it never caches or intercepts a page.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  // Only same-site paths: "//host" would resolve to another origin.
  const url =
    typeof message.url === "string" && /^\/(?![/\\])/.test(message.url)
      ? message.url
      : "/notifications";
  event.waitUntil(
    self.registration.showNotification(message.title || "Betabook", {
      body: message.body || "",
      icon: "/branding/app-icon-192.png",
      // Later sends that day replace this notification without buzzing again.
      tag: message.tag || "send-alert",
      renotify: false,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === target.origin);
      if (open) return open.focus().then(() => open.navigate(target.href));
      return self.clients.openWindow(target.href);
    }),
  );
});
