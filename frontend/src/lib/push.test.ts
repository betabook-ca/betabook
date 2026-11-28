import { afterEach, expect, it, vi } from "vitest";

import { enablePush, pushSupport } from "@/lib/push";

vi.mock("@/spa/lib/actions-client", () => ({
  savePushSubscription: vi.fn<() => Promise<unknown>>(),
  deletePushSubscription: vi.fn<() => Promise<unknown>>(),
}));

afterEach(() => vi.unstubAllGlobals());

function env(windowKeys: string[], navigator: Partial<Navigator> & Record<string, unknown>) {
  const win = Object.fromEntries(windowKeys.map((key) => [key, {}]));
  return {
    window: win as unknown as Window & typeof globalThis,
    navigator: { userAgent: "", platform: "", maxTouchPoints: 0, ...navigator } as Navigator,
  };
}

it("supports browsers with a service worker, push manager and notifications", () => {
  expect(pushSupport(env(["PushManager", "Notification"], { serviceWorker: {} } as never))).toBe(
    "supported",
  );
});

it("asks iPhone and iPad browser tabs to add the site to the Home Screen", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/131.0";
  expect(pushSupport(env([], { userAgent: iphone, serviceWorker: {} } as never))).toBe("install");
  expect(pushSupport(env([], { platform: "MacIntel", maxTouchPoints: 5 }))).toBe("install");
});

it("reports other browsers without push as unsupported", () => {
  expect(pushSupport(env(["Notification"], { platform: "MacIntel" }))).toBe("unsupported");
});

it.each([
  ["default", "Allow notifications when your browser asks to turn them on."],
  ["denied", "Notifications are blocked for Betabook in this browser's settings."],
])("explains a %s permission without subscribing", async (permission, error) => {
  const register = vi.fn<() => Promise<never>>();
  vi.stubGlobal("Notification", { requestPermission: async () => permission });
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  expect(await enablePush("key")).toEqual({ ok: false, error });
  expect(register).not.toHaveBeenCalled();
});
