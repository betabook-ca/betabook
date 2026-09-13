import { formatUsd } from "@/lib/format";

export type CloudflareUsage = {
  periodStart: string;
  periodEnd: string;
  workerRequests: number;
  workerCpuMs: number;
  d1RowsRead: number;
};

export type UsageMeter = {
  key: "workerRequests" | "workerCpuMs" | "d1RowsRead";
  label: string;
  description: string;
  unit: string;
  used: number;
  included: number;
  usdPerMillion: number;
  overageUsd: number;
};

export type CostLine = { label: string; note: string; monthlyUsd: number };

const WORKERS_PAID_USD_PER_MONTH = 5;
const DOMAIN_USD_PER_YEAR = 9.19;

/** Workers Paid allowances and per-million overage rates, in USD. The allowance
 * is account-wide, so every Worker on the account draws from it. */
const USAGE_TIERS = [
  {
    key: "workerRequests",
    label: "Worker requests",
    description: "Page loads, searches and other requests the site’s code handles.",
    unit: "requests",
    included: 10_000_000,
    usdPerMillion: 0.3,
  },
  {
    key: "workerCpuMs",
    label: "Worker CPU time",
    description: "Time that code spends working. Waiting on the database doesn’t count.",
    unit: "CPU-ms",
    included: 30_000_000,
    usdPerMillion: 0.02,
  },
  {
    key: "d1RowsRead",
    label: "D1 rows read",
    description:
      "Rows scanned in D1, the Cloudflare database that holds climbs, areas, sends and journals.",
    unit: "rows",
    included: 25_000_000_000,
    usdPerMillion: 0.001,
  },
] as const satisfies Omit<UsageMeter, "used" | "overageUsd">[];

export function usageMeters(usage: CloudflareUsage): UsageMeter[] {
  return USAGE_TIERS.map((tier) => {
    const used = usage[tier.key];
    const overageUsd = (Math.max(0, used - tier.included) / 1_000_000) * tier.usdPerMillion;
    return { ...tier, used, overageUsd };
  });
}

export function monthlyCosts(meters: UsageMeter[] | null): { lines: CostLine[]; totalUsd: number } {
  const lines: CostLine[] = [
    {
      label: "Cloudflare Workers Paid",
      note: "Monthly plan that includes the usage above",
      monthlyUsd: WORKERS_PAID_USD_PER_MONTH,
    },
    {
      label: "betabook.ca domain",
      note: `${formatUsd(DOMAIN_USD_PER_YEAR)} a year`,
      monthlyUsd: DOMAIN_USD_PER_YEAR / 12,
    },
  ];
  if (meters)
    lines.push({
      label: "Usage beyond the plan",
      note: "Charged per million past each allowance",
      monthlyUsd: meters.reduce((sum, meter) => sum + meter.overageUsd, 0),
    });
  return { lines, totalUsd: lines.reduce((sum, line) => sum + line.monthlyUsd, 0) };
}
