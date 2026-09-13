import { afterEach, expect, it, vi } from "vitest";

import { getCloudflareUsage } from "./cloudflare-usage";

const env = vi.hoisted(() => ({
  CLOUDFLARE_USAGE_ACCOUNT_ID: "account-tag" as string | undefined,
  CLOUDFLARE_USAGE_API_TOKEN: "usage-token" as string | undefined,
}));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env }) }));

afterEach(() => {
  env.CLOUDFLARE_USAGE_ACCOUNT_ID = "account-tag";
  env.CLOUDFLARE_USAGE_API_TOKEN = "usage-token";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const accounts = (account: Record<string, unknown>) =>
  Response.json({ data: { viewer: { accounts: [account] } } });
function variablesOf(fetcher: ReturnType<typeof vi.fn<typeof fetch>>, call = 0) {
  const body = fetcher.mock.calls[call][1]?.body;
  if (typeof body !== "string") throw new Error("Expected a JSON string request body");
  const { variables }: { variables: Record<string, string> } = JSON.parse(body);
  return variables;
}

it.each(["CLOUDFLARE_USAGE_ACCOUNT_ID", "CLOUDFLARE_USAGE_API_TOKEN"] as const)(
  "returns null without %s and sends no request",
  async (key) => {
    env[key] = undefined;
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);

    expect(await getCloudflareUsage(new Date("2026-05-10T00:00:00Z"))).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it("sums week-long windows from the 1st into this month's requests, CPU milliseconds and D1 rows read", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    accounts({
      workers0: [{ sum: { requests: 1_000, cpuTimeUs: 2_000_000 } }],
      workers1: [{ sum: { requests: 500, cpuTimeUs: 500_000 } }],
      d10: [{ sum: { rowsRead: 7 } }],
      d11: [],
    }),
  );
  vi.stubGlobal("fetch", fetcher);

  expect(await getCloudflareUsage(new Date("2026-09-13T12:00:00Z"))).toEqual({
    periodStart: "2026-09-01",
    periodEnd: "2026-10-01",
    workerRequests: 1_500,
    workerCpuMs: 2_500,
    d1RowsRead: 7,
  });
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe("https://api.cloudflare.com/client/v4/graphql");
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer usage-token");
  expect(variablesOf(fetcher)).toEqual({
    accountTag: "account-tag",
    start0: "2026-09-01T00:00:00Z",
    end0: "2026-09-08T00:00:00Z",
    startDate0: "2026-09-01",
    endDate0: "2026-09-08",
    start1: "2026-09-08T00:00:00Z",
    end1: "2026-09-14T00:00:00Z",
    startDate1: "2026-09-08",
    endDate1: "2026-09-14",
  });
});

it("splits a 31-day month into five windows and reuses the result on the next view", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () =>
      accounts({ workers4: [{ sum: { requests: 9, cpuTimeUs: 1_000 } }] }),
    );
  vi.stubGlobal("fetch", fetcher);
  const now = new Date("2026-08-31T23:00:00Z");

  const first = await getCloudflareUsage(now);
  expect(first).toEqual({
    periodStart: "2026-08-01",
    periodEnd: "2026-09-01",
    workerRequests: 9,
    workerCpuMs: 1,
    d1RowsRead: 0,
  });
  expect(await getCloudflareUsage(now)).toEqual(first);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const variables = variablesOf(fetcher);
  expect([variables.startDate4, variables.endDate4]).toEqual(["2026-08-29", "2026-09-01"]);
  expect(variables.startDate5).toBeUndefined();
});

it.each([
  ["an HTTP error", "2026-07-10T00:00:00Z", () => new Response("forbidden", { status: 403 })],
  [
    "GraphQL errors",
    "2026-06-10T00:00:00Z",
    () => Response.json({ data: null, errors: [{ message: "not authorized" }] }),
  ],
])("returns null without caching when Cloudflare answers with %s", async (_case, at, reply) => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementationOnce(async () => reply())
    .mockImplementationOnce(async () => accounts({ d10: [{ sum: { rowsRead: 3 } }] }));
  vi.stubGlobal("fetch", fetcher);
  const now = new Date(at);

  expect(await getCloudflareUsage(now)).toBeNull();
  expect(await getCloudflareUsage(now)).toMatchObject({ d1RowsRead: 3 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
