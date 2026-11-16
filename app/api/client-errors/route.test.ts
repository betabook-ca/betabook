import { afterEach, beforeEach, expect, it, vi, type MockInstance } from "vitest";

import { POST } from "@/app/api/client-errors/route";
import { CLIENT_ERROR_EVENT } from "@/lib/error-reporting";
import { allowClientErrorReport } from "@/lib/rate-limit";

vi.mock("@/lib/rate-limit", () => ({
  allowClientErrorReport: vi.fn<() => Promise<boolean>>(async () => true),
}));

const ORIGIN = "https://betabook.ca";
let log: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(allowClientErrorReport).mockResolvedValue(true);
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

function report(body: string, headers: Record<string, string> = {}) {
  return POST(
    new Request(`${ORIGIN}/api/client-errors`, {
      method: "POST",
      body,
      headers: { origin: ORIGIN, "cf-connecting-ip": "203.0.113.7", ...headers },
    }),
  );
}

const valid = JSON.stringify({
  boundary: "page",
  digest: "1139012270",
  message: "An error occurred in the Server Components render.",
  path: "/feed",
});

it("logs a same-origin report and answers 204", async () => {
  const response = await report(valid);

  expect(response.status).toBe(204);
  expect(allowClientErrorReport).toHaveBeenCalledWith("203.0.113.7");
  expect(log).toHaveBeenCalledWith({
    event: CLIENT_ERROR_EVENT,
    boundary: "page",
    digest: "1139012270",
    message: "An error occurred in the Server Components render.",
    path: "/feed",
  });
});

it.each([
  ["another site", { origin: "https://evil.example" }],
  ["no origin", { origin: "" }],
])("refuses a report from %s before spending the limit", async (_label, headers) => {
  const response = await report(valid, headers);

  expect(response.status).toBe(403);
  expect(allowClientErrorReport).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

it("answers 429 once the address is over its limit", async () => {
  vi.mocked(allowClientErrorReport).mockResolvedValue(false);

  expect((await report(valid)).status).toBe(429);
  expect(log).not.toHaveBeenCalled();
});

it.each([
  ["invalid JSON", "{", 400],
  ["a body the boundary would not send", JSON.stringify({ boundary: "page", path: "/" }), 400],
  [
    "an oversized body",
    JSON.stringify({ boundary: "page", message: "m".repeat(5000), path: "/" }),
    413,
  ],
])("refuses %s", async (_label, body, status) => {
  expect((await report(body)).status).toBe(status);
  expect(log).not.toHaveBeenCalled();
});

it("counts bytes, not characters", async () => {
  // 2,100 "é" stay under 4,096 characters but take 4,200 bytes.
  const body = JSON.stringify({ boundary: "page", message: "é".repeat(2100), path: "/" });
  expect(body.length).toBeLessThan(4096);

  expect((await report(body)).status).toBe(413);
  expect(log).not.toHaveBeenCalled();
});

it("refuses a declared length over the cap without reading the body", async () => {
  let pulled = 0;
  // highWaterMark 0: the stream is pulled only when someone reads it.
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulled += 1;
        controller.enqueue(new TextEncoder().encode(valid));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const response = await POST(
    new Request(`${ORIGIN}/api/client-errors`, {
      method: "POST",
      body,
      headers: { origin: ORIGIN, "content-length": "1000000" },
    }),
  );

  expect(response.status).toBe(413);
  expect(pulled).toBe(0);
});

it("stops reading an undeclared body once it passes the cap", async () => {
  const chunk = new Uint8Array(1024).fill(0x20);
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      controller.enqueue(chunk);
    },
  });

  const response = await POST(
    new Request(`${ORIGIN}/api/client-errors`, {
      method: "POST",
      body,
      headers: { origin: ORIGIN },
    }),
  );

  expect(response.status).toBe(413);
  // Five 1 KB chunks pass the 4 KB cap; the endless stream is cancelled there.
  expect(pulled).toBeLessThanOrEqual(6);
});
