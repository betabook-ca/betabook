import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { RunningCosts } from "@/components/running-costs";

const period = { periodStart: "2026-09-01", periodEnd: "2026-10-01" };
const progressBar = (html: string, label: string) =>
  html.match(new RegExp(`<div[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? "";

it("shows how much of each Workers Paid allowance this month has used", () => {
  const html = renderToStaticMarkup(
    <RunningCosts
      usage={{
        ...period,
        workerRequests: 1_400_000,
        workerCpuMs: 3_500_000,
        d1RowsRead: 1_000_000_000,
      }}
      supportUrl={null}
    />,
  );

  expect(html).toContain("Since Sep 1, resets Oct 1");
  for (const [label, amount, share, rate, now, max] of [
    [
      "Worker requests",
      "1.4M of 10M requests",
      "14% used",
      "$0.30 per million requests",
      "1400000",
      "10000000",
    ],
    [
      "Worker CPU time",
      "3.5M of 30M CPU-ms",
      "12% used",
      "$0.02 per million CPU-ms",
      "3500000",
      "30000000",
    ],
    [
      "D1 rows read",
      "1B of 25B rows",
      "4% used",
      "$0.001 per million rows",
      "1000000000",
      "25000000000",
    ],
  ]) {
    expect(html).toContain(label);
    expect(html).toContain(amount);
    expect(html).toContain(share);
    expect(html).toContain(rate);
    const bar = progressBar(html, `${label} used`);
    expect(bar).toContain('role="progressbar"');
    expect(bar).toContain(`aria-valuenow="${now}"`);
    expect(bar).toContain(`aria-valuemax="${max}"`);
  }
  expect(html).toContain("$5.77");
});

it("marks a tier past its allowance and adds the overage to the monthly total", () => {
  const html = renderToStaticMarkup(
    <RunningCosts
      usage={{ ...period, workerRequests: 12_000_000, workerCpuMs: 0, d1RowsRead: 0 }}
      supportUrl={null}
    />,
  );

  expect(html).toContain("120% used");
  expect(progressBar(html, "Worker requests used")).toContain('aria-valuenow="10000000"');
  expect(html).toContain("Usage beyond the plan");
  expect(html).toContain("$0.60");
  expect(html).toContain("$6.37");
});

it("lists only the fixed bills when live usage is unavailable", () => {
  const html = renderToStaticMarkup(<RunningCosts usage={null} supportUrl={null} />);

  expect(html).toContain("Live usage is unavailable right now");
  expect(html).not.toContain('role="progressbar"');
  expect(html).toContain("Cloudflare Workers Paid");
  expect(html).toContain("$9.19 a year");
  expect(html).not.toContain("Usage beyond the plan");
  expect(html).toContain("$5.77");
});

it("links out to the support page", () => {
  const html = renderToStaticMarkup(
    <RunningCosts
      usage={{ ...period, workerRequests: 1_400_000, workerCpuMs: 0, d1RowsRead: 0 }}
      supportUrl="https://support.example/betabook"
    />,
  );

  const link = html.match(/<a[^>]*>Support Betabook<\/a>/)?.[0] ?? "";
  expect(link).toContain('href="https://support.example/betabook"');
  expect(link).toContain('target="_blank"');
  expect(link).toContain('rel="noreferrer"');
  expect(html).toContain("Payments go toward these bills and aren’t tax-deductible.");
});

it("leaves out the support ask when no support page is set", () => {
  const html = renderToStaticMarkup(<RunningCosts usage={null} supportUrl={null} />);

  expect(html).toContain("Total per month");
  expect(html).not.toContain("Support Betabook");
  expect(html).not.toContain("tax-deductible");
});

it("says what each tier measures, including that D1 is Betabook's database", () => {
  const html = renderToStaticMarkup(
    <RunningCosts
      usage={{ ...period, workerRequests: 1, workerCpuMs: 1, d1RowsRead: 1 }}
      supportUrl={null}
    />,
  );

  expect(html).toContain("Page loads, searches and other requests the site’s code handles.");
  expect(html).toContain("Time that code spends working. Waiting on the database doesn’t count.");
  expect(html).toContain(
    "Rows scanned in D1, the Cloudflare database that holds climbs, areas, sends and journals.",
  );
});
