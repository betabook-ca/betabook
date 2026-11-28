import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://betabook.ca";

type Listener = (event: Record<string, unknown>) => void;

function worker(
  windows: { url: string; navigate: () => Promise<unknown>; focus: () => Promise<unknown> }[] = [],
) {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn<
    (title: string, options: Record<string, unknown>) => Promise<void>
  >(async () => {});
  const openWindow = vi.fn<(url: string) => Promise<null>>(async () => null);
  const matchAll = vi.fn<(options?: Record<string, unknown>) => Promise<typeof windows>>(
    async () => windows,
  );
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: async () => {},
    registration: { showNotification },
    clients: { claim: async () => {}, matchAll, openWindow },
    location: { origin: ORIGIN },
  };
  runInNewContext(source, { self, URL });
  async function dispatch(type: string, event: Record<string, unknown>) {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(type)?.({
      ...event,
      waitUntil: (promise: Promise<unknown>) => (pending = promise),
    });
    await pending;
  }
  return { dispatch, showNotification, openWindow, matchAll };
}

const click = (url: string) => ({ notification: { close: () => {}, data: { url } } });

it("shows each alert under its day's tag without buzzing again for updates", async () => {
  const sw = worker();
  const message = {
    title: "Sam sent 3 climbs",
    body: "Latest: Iron Man.",
    url: "/users/sam/sends?date=2026-11-21",
    tag: "send-alert:sam:2026-11-21",
  };
  await sw.dispatch("push", { data: { json: () => message } });
  expect(sw.showNotification).toHaveBeenCalledWith(
    "Sam sent 3 climbs",
    expect.objectContaining({ tag: message.tag, renotify: false, data: { url: message.url } }),
  );
});

it("opens only same-site paths from a push", async () => {
  const sw = worker();
  for (const url of ["//evil.example/x", "/\\evil.example", "https://evil.example/"]) {
    await sw.dispatch("push", { data: { json: () => ({ title: "x", url }) } });
    expect(sw.showNotification.mock.lastCall?.[1].data).toEqual({ url: "/notifications" });
  }
});

it("navigates an open Betabook window to the alert", async () => {
  const focus = vi.fn<() => Promise<unknown>>(async () => ({}));
  const navigate = vi.fn<() => Promise<unknown>>(async () => ({ focus }));
  const sw = worker([{ url: `${ORIGIN}/feed`, navigate, focus: async () => ({}) }]);
  await sw.dispatch("notificationclick", click("/users/sam/sends?date=2026-11-21"));
  expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/users/sam/sends?date=2026-11-21`);
  expect(focus).toHaveBeenCalled();
  expect(sw.openWindow).not.toHaveBeenCalled();
});

it("opens a new window when an open tab can't be navigated", async () => {
  const navigate = vi.fn<() => Promise<unknown>>(async () => {
    throw new TypeError("This service worker is not the client's active service worker.");
  });
  const sw = worker([{ url: `${ORIGIN}/feed`, navigate, focus: async () => ({}) }]);
  await sw.dispatch("notificationclick", click("/notifications"));
  expect(sw.openWindow).toHaveBeenCalledWith(`${ORIGIN}/notifications`);
});
