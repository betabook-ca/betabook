self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const readMessage = (data) => {
  try {
    return data?.json() ?? {};
  } catch {
    return {};
  }
};

self.addEventListener("push", (event) => {
  const message = readMessage(event.data);
  // Only same-site paths: "//host" would resolve to another origin.
  const url =
    typeof message.url === "string" && /^\/(?![/\\])/.test(message.url)
      ? message.url
      : "/notifications";
  event.waitUntil(
    self.registration.showNotification(message.title || "Betabook", {
      body: message.body || "",
      icon: "/branding/app-icon-192.png",
      tag: message.tag || "send-alert",
      renotify: false,
      data: { url },
    }),
  );
});

const openAlert = async (href) => {
  const windows = await self.clients.matchAll({ type: "window" });
  const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
  if (open) {
    try {
      const navigated = await open.navigate(href);
      if (navigated) return navigated.focus();
    } catch {
      // navigate() rejects for a window this worker no longer controls.
    }
  }
  return self.clients.openWindow(href);
};

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(openAlert(new URL(event.notification.data.url, self.location.origin).href));
});
