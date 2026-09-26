import type { Metadata } from "next";
import { connection } from "next/server";

import { RunningCosts } from "@/components/running-costs";
import { READING_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import { PageTitle } from "@/components/ui/typography";
import { getCloudflareUsage } from "@/lib/cloudflare-usage";
import { COSTS_PAGE } from "@/lib/landing-pages";
import { pageMetadata } from "@/lib/seo";
import { SUPPORT_URL } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Cost transparency",
  description:
    "What Betabook costs to run: this month’s Worker requests, CPU time and D1 reads against Cloudflare’s Workers Paid plan, and the monthly bill.",
  path: COSTS_PAGE.path,
});

export default async function CostsPage() {
  await connection();
  const usage = await getCloudflareUsage();

  return (
    <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col gap-6`}>
      <div className="flex flex-col gap-3">
        <PageTitle>Cost transparency</PageTitle>
        <p className="text-lg leading-relaxed text-pretty text-muted">
          Betabook has no ads or fees. Its code runs on Cloudflare Workers and its data lives in
          Cloudflare D1, a SQL database. The Workers Paid plan covers both with a monthly allowance
          of requests, CPU time and database reads, and bills per million past that.
        </p>
      </div>

      <RunningCosts usage={usage} supportUrl={SUPPORT_URL} />

      <p className="text-sm leading-relaxed text-pretty text-muted">
        Usage comes from Cloudflare’s sampled analytics and refreshes hourly. Amounts are in US
        dollars.
      </p>
    </div>
  );
}
