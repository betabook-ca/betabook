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

it("cuts a long path to what the endpoint accepts instead of losing the report", async () => {
  const sendBeacon = vi.fn<(url: string, data: Blob) => boolean>(() => true);
  vi.stubGlobal("navigator", { sendBeacon });
  vi.stubGlobal("window", { location: { pathname: `/search/${"%20".repeat(400)}` } });

  reportClientError("page", new Error("boom"));

  const report = JSON.parse(await sendBeacon.mock.calls[0][1].text()) as { path: string };
  expect(report.path).toHaveLength(512);
  expect(report.path.startsWith("/search/%20")).toBe(true);
});
