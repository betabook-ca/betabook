import { expect, it } from "vitest";

import { monthlyCosts, usageMeters } from "./running-costs";

const period = { periodStart: "2026-09-01", periodEnd: "2026-10-01" };

it("reports usage up to each Workers Paid allowance as included, with no overage", () => {
  const meters = usageMeters({
    ...period,
    workerRequests: 10_000_000,
    workerCpuMs: 3_500_000,
    d1RowsRead: 1_000_000_000,
  });

  expect(
    meters.map(({ key, used, included, overageUsd }) => [key, used, included, overageUsd]),
  ).toEqual([
    ["workerRequests", 10_000_000, 10_000_000, 0],
    ["workerCpuMs", 3_500_000, 30_000_000, 0],
    ["d1RowsRead", 1_000_000_000, 25_000_000_000, 0],
  ]);
  const costs = monthlyCosts(meters);
  expect(costs.lines.map(({ label, monthlyUsd }) => [label, monthlyUsd])).toEqual([
    ["Cloudflare Workers Paid", 5],
    ["betabook.ca domain", 9.19 / 12],
    ["Usage beyond the plan", 0],
  ]);
  expect(costs.totalUsd).toBeCloseTo(5.7658, 4);
});

it("charges each tier's rate only on usage past its allowance", () => {
  const meters = usageMeters({
    ...period,
    workerRequests: 12_000_000,
    workerCpuMs: 40_000_000,
    d1RowsRead: 30_000_000_000,
  });

  expect(meters.map(({ key }) => key)).toEqual(["workerRequests", "workerCpuMs", "d1RowsRead"]);
  expect(meters[0].overageUsd).toBeCloseTo(0.6, 6);
  expect(meters[1].overageUsd).toBeCloseTo(0.2, 6);
  expect(meters[2].overageUsd).toBeCloseTo(5, 6);
  const costs = monthlyCosts(meters);
  expect(costs.lines.at(-1)?.label).toBe("Usage beyond the plan");
  expect(costs.lines.at(-1)?.monthlyUsd).toBeCloseTo(5.8, 6);
  expect(costs.totalUsd).toBeCloseTo(11.5658, 4);
});

it("lists only the fixed bills when live usage is unavailable", () => {
  const costs = monthlyCosts(null);

  expect(costs.lines.map(({ label }) => label)).toEqual([
    "Cloudflare Workers Paid",
    "betabook.ca domain",
  ]);
  expect(costs.totalUsd).toBeCloseTo(5.7658, 4);
});
