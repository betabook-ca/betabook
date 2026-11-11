import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendErrorAlertEmail } from "@/lib/email";

import { describeErrorEvent, runErrorAlert } from "./error-alert";

const env = vi.hoisted(() => ({
  ERROR_ALERT_ACCOUNT_ID: "account-tag" as string | undefined,
  ERROR_ALERT_API_TOKEN: "alert-token" as string | undefined,
}));
vi.mock("@/lib/cloudflare-env", () => ({ getCloudflareEnv: async () => env }));
vi.mock("@/lib/email", () => ({
  sendErrorAlertEmail: vi.fn<typeof sendErrorAlertEmail>(async () => {}),
}));

beforeEach(() => {
  env.ERROR_ALERT_ACCOUNT_ID = "account-tag";
  env.ERROR_ALERT_API_TOKEN = "alert-token";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const MINUTE = 60_000;
/** A run whose window, 03:05 to 03:15, does not contain the hour. */
const MID_HOUR = Date.parse("2026-11-10T03:20:00Z");
/** A run whose window, 02:55 to 03:05, contains 03:00. */
const ON_THE_HOUR = Date.parse("2026-11-10T03:10:00Z");

const feedEvent = {
  timestamp: Date.parse("2026-11-10T03:07:12Z"),
  source: {
    event: "request_error",
    digest: "1139012270",
    routePath: "/feed",
    error: {
      message: "Failed query: WITH friends AS (…)",
      causes: [{ message: "D1_ERROR: VIEWs and/or subqueries nested too deep" }],
    },
  },
};

function telemetry(count: number, events: unknown[] = []) {
  return Response.json({ success: true, result: { events: { count, events } } });
}
function bodyOf(fetcher: ReturnType<typeof vi.fn<typeof fetch>>, call: number) {
  const body = fetcher.mock.calls[call][1]?.body;
  if (typeof body !== "string") throw new Error("Expected a JSON string request body");
  return JSON.parse(body) as {
    view: string;
    limit: number;
    timeframe: { from: number; to: number };
    parameters: { filters: { key: string; value: string }[] };
  };
}

it.each(["ERROR_ALERT_ACCOUNT_ID", "ERROR_ALERT_API_TOKEN"] as const)(
  "is off without %s and sends no request",
  async (key) => {
    env[key] = undefined;
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);

    expect(await runErrorAlert(MID_HOUR)).toEqual({ status: "off" });
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it("queries the Worker's error-level events for the window that ended five minutes ago", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(telemetry(0));
  vi.stubGlobal("fetch", fetcher);

  expect(await runErrorAlert(MID_HOUR)).toEqual({ status: "quiet" });

  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://api.cloudflare.com/client/v4/accounts/account-tag/workers/observability/telemetry/query",
  );
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer alert-token" });
  const body = bodyOf(fetcher, 0);
  expect(body.view).toBe("events");
  expect(body.timeframe).toEqual({ from: MID_HOUR - 15 * MINUTE, to: MID_HOUR - 5 * MINUTE });
  expect(body.parameters.filters).toEqual([
    { key: "$workers.scriptName", operation: "eq", type: "string", value: "betabook" },
    { key: "$metadata.level", operation: "eq", type: "string", value: "error" },
  ]);
  expect(sendErrorAlertEmail).not.toHaveBeenCalled();
});

describe("when the window has errors", () => {
  it("emails at once after a quiet hour, naming the route, digest and D1 cause", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(telemetry(3, [feedEvent]))
      .mockResolvedValueOnce(telemetry(0));
    vi.stubGlobal("fetch", fetcher);

    expect(await runErrorAlert(MID_HOUR)).toEqual({ status: "sent", count: 3 });

    expect(bodyOf(fetcher, 1).timeframe).toEqual({
      from: MID_HOUR - 75 * MINUTE,
      to: MID_HOUR - 15 * MINUTE,
    });
    expect(sendErrorAlertEmail).toHaveBeenCalledTimes(1);
    const [{ subject, text }] = vi.mocked(sendErrorAlertEmail).mock.calls[0];
    expect(subject).toBe("Betabook: 3 production errors");
    expect(text).toContain(
      "3 error-level events from 2026-11-10T03:05:00.000Z to 2026-11-10T03:15:00.000Z",
    );
    expect(text).toContain(
      "2026-11-10T03:07:12.000Z · request_error · /feed · digest 1139012270 · D1_ERROR: VIEWs and/or subqueries nested too deep",
    );
  });

  it("stays silent mid-hour while errors are continuing", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(telemetry(2, [feedEvent]))
      .mockResolvedValueOnce(telemetry(40));
    vi.stubGlobal("fetch", fetcher);

    expect(await runErrorAlert(MID_HOUR)).toEqual({ status: "suppressed", count: 2 });
    expect(sendErrorAlertEmail).not.toHaveBeenCalled();
  });

  it("reminds once an hour without checking the hour before", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(telemetry(1, [feedEvent]));
    vi.stubGlobal("fetch", fetcher);

    expect(await runErrorAlert(ON_THE_HOUR)).toEqual({ status: "sent", count: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendErrorAlertEmail).mock.calls[0][0].subject).toBe(
      "Betabook: 1 production error",
    );
  });
});

it("throws when the query fails, so the cron run shows as failed", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 403 })),
  );

  await expect(runErrorAlert(MID_HOUR)).rejects.toThrow("Telemetry query failed with 403");
  expect(sendErrorAlertEmail).not.toHaveBeenCalled();
});

describe("describeErrorEvent", () => {
  it("falls back to a plain console.error message", () => {
    expect(
      describeErrorEvent({
        timestamp: Date.parse("2026-11-10T03:07:12Z"),
        source: "Resend rejected a verification email",
      }),
    ).toBe("2026-11-10T03:07:12.000Z · Resend rejected a verification email");
  });

  it("names a client report by its path", () => {
    expect(
      describeErrorEvent({
        timestamp: Date.parse("2026-11-10T03:07:12Z"),
        source: { event: "client_error", path: "/feed", digest: "42", message: "boom" },
      }),
    ).toBe("2026-11-10T03:07:12.000Z · client_error · /feed · digest 42 · boom");
  });
});
