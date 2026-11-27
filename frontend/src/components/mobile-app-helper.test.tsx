import { afterEach, describe, expect, it, vi } from "vitest";

import { OPEN_MOBILE_HELPER_EVENT, openMobileAppHelper } from "@/components/mobile-app-helper";

describe("openMobileAppHelper", () => {
  it("dispatches OPEN_MOBILE_HELPER_EVENT when window is available", () => {
    let capturedEventName = "";
    const fakeWindow = {
      dispatchEvent: (event: { type: string }) => {
        capturedEventName = event.type;
        return true;
      },
    };

    vi.stubGlobal("window", fakeWindow);
    openMobileAppHelper();
    expect(capturedEventName).toBe(OPEN_MOBILE_HELPER_EVENT);
  });

  it("safely handles server-side execution without window", () => {
    vi.stubGlobal("window", undefined);
    expect(() => openMobileAppHelper()).not.toThrow();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
