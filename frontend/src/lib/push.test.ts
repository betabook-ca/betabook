import { expect, it } from "vitest";

import { pushSupport } from "@/lib/push";

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
