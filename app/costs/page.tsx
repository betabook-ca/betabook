import type { Metadata } from "next";
import { connection } from "next/server";

import { RunningCosts } from "@/components/running-costs";
import { AppLink } from "@/components/ui/app-link";
import { PageTitle } from "@/components/ui/typography";
import { getCloudflareUsage } from "@/lib/cloudflare-usage";
import { COSTS_PAGE } from "@/lib/landing-pages";
import { pageMetadata } from "@/lib/seo";
import { SUPPORT_URL } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Running costs",
  description:
    "What Betabook costs to run: this month’s Worker requests, CPU time and D1 reads against Cloudflare’s Workers Paid plan, and the monthly bill.",
  path: COSTS_PAGE.path,
});

export default async function CostsPage() {
  await connection();
  const usage = await getCloudflareUsage();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageTitle>What Betabook costs to run</PageTitle>
        <p className="text-lg leading-relaxed text-pretty text-muted">
          Betabook has no ads or fees. It runs on Cloudflare’s Workers Paid plan, which includes a
          set number of Worker requests, CPU time and database reads each month and bills per
          million past that.
        </p>
      </div>

      <RunningCosts usage={usage} supportUrl={SUPPORT_URL} />

      <p className="text-sm leading-relaxed text-pretty text-muted">
        Usage comes from Cloudflare’s sampled analytics and refreshes hourly. Amounts are in US
        dollars. The{" "}
        <AppLink href="/about" className="inline underline">
          About page
        </AppLink>{" "}
        explains how Betabook stays free.
      </p>
    </div>
  );
}
