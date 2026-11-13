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
