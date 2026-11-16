import { afterEach, expect, it, vi } from "vitest";

import { reportClientError } from "./client-error-report";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("caps the message so a long one still fits the endpoint's 4 KB limit", async () => {
  const sendBeacon = vi.fn<(url: string, data: Blob) => boolean>(() => true);
  vi.stubGlobal("navigator", { sendBeacon });
  vi.stubGlobal("window", { location: { pathname: "/feed" } });

  reportClientError("page", Object.assign(new Error("\u0001".repeat(5000)), { digest: "42" }));

  expect(sendBeacon).toHaveBeenCalledTimes(1);
  const [url, blob] = sendBeacon.mock.calls[0];
  expect(url).toBe("/api/client-errors");
  const text = await blob.text();
  expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(4096);
  expect(JSON.parse(text)).toEqual({
    boundary: "page",
    digest: "42",
    message: "\u0001".repeat(500),
    path: "/feed",
  });
});
