import { afterEach, expect, it, vi } from "vitest";

import { enablePush, pushSupport } from "@/lib/push";

vi.mock("@/spa/lib/actions-client", () => ({
  savePushSubscription: vi.fn<() => Promise<unknown>>(),
  deletePushSubscription: vi.fn<() => Promise<unknown>>(),
}));

afterEach(() => vi.unstubAllGlobals());

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/131.0";

it("supports browsers with a service worker, push manager and notifications", () => {
  vi.stubGlobal("navigator", { serviceWorker: {}, userAgent: "" });
  vi.stubGlobal("PushManager", {});
  vi.stubGlobal("Notification", {});
  expect(pushSupport()).toBe("supported");
});

it("asks iPhone browser tabs to add the site to the Home Screen", () => {
  vi.stubGlobal("navigator", { userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5 });
  expect(pushSupport()).toBe("install");
});

it("reports other browsers without push as unsupported", () => {
  vi.stubGlobal("navigator", { userAgent: "", platform: "MacIntel", maxTouchPoints: 5 });
  expect(pushSupport()).toBe("unsupported");
});

it.each([
  ["default", "Allow notifications when your browser asks to turn them on."],
  ["denied", null],
])("returns without subscribing on a %s permission", async (permission, error) => {
  const register = vi.fn<() => Promise<never>>();
  vi.stubGlobal("Notification", { requestPermission: async () => permission });
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  expect(await enablePush("key")).toEqual({ ok: false, error });
  expect(register).not.toHaveBeenCalled();
});
