import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectMobileBrowser,
  detectMobilePlatform,
  isMobileDevice,
  isMobileHelperDismissed,
  setMobileHelperDismissed,
} from "@/lib/mobile-detection";

describe("detectMobilePlatform", () => {
  it("detects iOS devices correctly", () => {
    const iPhoneUA =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
    expect(detectMobilePlatform(iPhoneUA, "iPhone")).toBe("ios");

    const iPadUA =
      "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
    expect(detectMobilePlatform(iPadUA, "iPad")).toBe("ios");

    // Modern iPad Pro with MacIntel platform, touch points, coarse pointer
    const iPadProUA =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";
    expect(detectMobilePlatform(iPadProUA, "MacIntel", 5, true)).toBe("ios");
    expect(detectMobilePlatform(iPadProUA, "", 5, true)).toBe("ios");
  });

  it("detects Android phones and tablets correctly", () => {
    // Android phone (has "Mobile")
    const androidPhoneUA =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Mobile Safari/537.36";
    expect(detectMobilePlatform(androidPhoneUA, "Linux armv8l")).toBe("android");

    // Android tablet (does NOT have "Mobile")
    const androidTabletUA =
      "Mozilla/5.0 (Linux; Android 14; SM-X900) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Safari/537.36";
    expect(detectMobilePlatform(androidTabletUA, "Linux armv8l")).toBe("android");
  });

  it("returns other for desktop platforms", () => {
    const macUA =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    expect(detectMobilePlatform(macUA, "MacIntel", 0)).toBe("other");

    const winUA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    expect(detectMobilePlatform(winUA, "Win32", 0)).toBe("other");
  });

  it("does not read a Mac with touch points but a fine pointer as an iPad", () => {
    const macUA =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    expect(detectMobilePlatform(macUA, "MacIntel", 5, false)).toBe("other");
  });
});

describe("detectMobileBrowser", () => {
  it("detects Chrome on iOS (CriOS)", () => {
    const chromeIOSUA =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.6261.89 Mobile/15E148 Safari/604.1";
    expect(detectMobileBrowser(chromeIOSUA)).toBe("chrome");
  });

  it("detects Chrome on Android", () => {
    const chromeAndroidUA =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Mobile Safari/537.36";
    expect(detectMobileBrowser(chromeAndroidUA)).toBe("chrome");
  });

  it("detects Safari on iOS", () => {
    const safariIOSUA =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
    expect(detectMobileBrowser(safariIOSUA)).toBe("safari");
  });

  it("does not classify Edge or Samsung Internet as plain Chrome", () => {
    const edgeAndroidUA =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 EdgA/122.0.2365.92";
    expect(detectMobileBrowser(edgeAndroidUA)).toBe("other");

    const samsungUA =
      "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36";
    expect(detectMobileBrowser(samsungUA)).toBe("other");
  });
});

describe("isMobileDevice", () => {
  it("identifies mobile devices from user agents and platform", () => {
    expect(isMobileDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0...)")).toBe(true);
    expect(isMobileDevice("", "iPhone")).toBe(true);
    expect(isMobileDevice("Mozilla/5.0 (Linux; Android 14...)")).toBe(true);
    expect(isMobileDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X...)", "MacIntel", 0)).toBe(false);
    expect(isMobileDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X...)", "MacIntel", 5, true)).toBe(
      true,
    );
    expect(isMobileDevice("", "MacIntel", 5, true)).toBe(true);
  });

  it("keeps a desktop Mac desktop even when it claims touch points", () => {
    // A Mac picks up touch points from an attached touchscreen or tablet; its
    // primary pointer stays fine, so the home screen callout must stay away.
    expect(isMobileDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X...)", "MacIntel", 5, false)).toBe(
      false,
    );
    expect(isMobileDevice("", "MacIntel", 5, false)).toBe(false);
  });

  it("still trusts an explicit mobile user agent without a coarse pointer", () => {
    // Desktop-mode request on a phone: the user agent is decisive on its own.
    expect(isMobileDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0...)", "iPhone", 5, false)).toBe(
      true,
    );
    expect(isMobileDevice("Mozilla/5.0 (Linux; Android 14...)", "Linux armv8l", 5, false)).toBe(
      true,
    );
  });
});

describe("localStorage dismissal helpers", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
      get length() {
        return store.size;
      },
      key: (_index: number) => null,
    };
    vi.stubGlobal("localStorage", mockStorage);
  });

  it("tolerates storage access being unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("Storage denied");
      },
      setItem() {
        throw new Error("Storage denied");
      },
      removeItem() {
        throw new Error("Storage denied");
      },
    });
    expect(isMobileHelperDismissed()).toBe(false);
    expect(() => setMobileHelperDismissed()).not.toThrow();
  });

  it("reads and sets dismissed state", () => {
    expect(isMobileHelperDismissed()).toBe(false);
    setMobileHelperDismissed();
    expect(isMobileHelperDismissed()).toBe(true);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
