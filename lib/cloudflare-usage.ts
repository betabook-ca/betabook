import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { CloudflareUsage } from "@/lib/running-costs";
import { SITE_URL } from "@/lib/site";

const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const DAY_MS = 86_400_000;
/** Cloudflare's docs disagree on how long one Workers analytics query may
 * span, so every window stays within a week. */
const WINDOW_DAYS = 7;
const CACHE_SECONDS = 60 * 60;

type Groups = { sum?: Record<string, number> }[] | undefined;
type UsageResponse = {
  data?: { viewer?: { accounts?: Record<string, Groups>[] } } | null;
  errors?: { message: string }[] | null;
};

const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

function usageQuery(windows: number): string {
  const declarations = ["$accountTag: string!"];
  const fields: string[] = [];
  for (let i = 0; i < windows; i += 1) {
    declarations.push(`$start${i}: string!`, `$end${i}: string!`);
    declarations.push(`$startDate${i}: Date!`, `$endDate${i}: Date!`);
    fields.push(
      `workers${i}: workersInvocationsAdaptive(limit: 1, filter: { datetime_geq: $start${i}, datetime_lt: $end${i} }) { sum { requests cpuTimeUs } }`,
      `d1${i}: d1AnalyticsAdaptiveGroups(limit: 1, filter: { date_geq: $startDate${i}, date_lt: $endDate${i} }) { sum { rowsRead } }`,
    );
  }
  return `query Usage(${declarations.join(", ")}) { viewer { accounts(filter: { accountTag: $accountTag }) { ${fields.join(" ")} } } }`;
}

/** Account-wide usage since the 1st (UTC), when Workers Paid allowances reset.
 * Null when the usage secrets are unset or Cloudflare doesn't answer. */
export async function getCloudflareUsage(now = new Date()): Promise<CloudflareUsage | null> {
  const { env } = await getCloudflareContext({ async: true });
  const accountTag = env.CLOUDFLARE_USAGE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_USAGE_API_TOKEN;
  if (!accountTag || !token) return null;

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = Date.UTC(year, month, 1);
  const end = Date.UTC(year, month + 1, 1);
  const cacheKey = `${SITE_URL}/__cloudflare-usage/${isoDate(start)}`;
  // `next dev` runs in Node, which has no Cache API.
  const cache = typeof caches === "undefined" ? null : await caches.open("cloudflare-usage");
  const cached = await cache?.match(cacheKey);
  if (cached) return cached.json<CloudflareUsage>();

  const through = Math.min(end, Date.UTC(year, month, now.getUTCDate() + 1));
  const variables: Record<string, string> = { accountTag };
  let windows = 0;
  for (let from = start; from < through; from += WINDOW_DAYS * DAY_MS, windows += 1) {
    const to = Math.min(from + WINDOW_DAYS * DAY_MS, through);
    variables[`start${windows}`] = `${isoDate(from)}T00:00:00Z`;
    variables[`end${windows}`] = `${isoDate(to)}T00:00:00Z`;
    variables[`startDate${windows}`] = isoDate(from);
    variables[`endDate${windows}`] = isoDate(to);
  }

  try {
    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: usageQuery(windows), variables }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Cloudflare GraphQL returned ${response.status}`);
    const body = await response.json<UsageResponse>();
    if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join("; "));
    const account = body.data?.viewer?.accounts?.[0];
    if (!account) throw new Error("Cloudflare GraphQL returned no account");

    const total = (alias: string, field: string) =>
      Array.from(
        { length: windows },
        (_, i) => account[`${alias}${i}`]?.[0]?.sum?.[field] ?? 0,
      ).reduce((sum, value) => sum + value, 0);
    const usage: CloudflareUsage = {
      periodStart: isoDate(start),
      periodEnd: isoDate(end),
      workerRequests: total("workers", "requests"),
      workerCpuMs: total("workers", "cpuTimeUs") / 1000,
      d1RowsRead: total("d1", "rowsRead"),
    };
    await cache?.put(
      cacheKey,
      Response.json(usage, { headers: { "Cache-Control": `max-age=${CACHE_SECONDS}` } }),
    );
    return usage;
  } catch (error) {
    console.error("Cloudflare usage query failed", error);
    return null;
  }
}
