import { buttonVariants } from "@heroui/react";

import { cardClass } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeading } from "@/components/ui/typography";
import { formatCompact, formatUsd } from "@/lib/format";
import { type CloudflareUsage, monthlyCosts, usageMeters } from "@/lib/running-costs";

const PANEL_CLASS = `flex flex-col divide-y divide-border ${cardClass("none", "bordered")}`;
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const day = (isoDate: string) => DAY.format(new Date(`${isoDate}T00:00:00Z`));

function share(used: number, included: number): string {
  const percent = (used / included) * 100;
  return percent > 0 && percent < 1 ? "<1%" : `${Math.round(percent)}%`;
}

export function RunningCosts({
  usage,
  supportUrl,
}: {
  usage: CloudflareUsage | null;
  supportUrl: string | null;
}) {
  const meters = usage ? usageMeters(usage) : null;
  const costs = monthlyCosts(meters);

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="costs-usage" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <SectionHeading id="costs-usage">Included usage</SectionHeading>
          {usage && (
            <p className="text-sm text-muted">
              {`Since ${day(usage.periodStart)}, resets ${day(usage.periodEnd)}`}
            </p>
          )}
        </div>
        {meters ? (
          <ul className={PANEL_CLASS}>
            {meters.map((meter) => (
              <li key={meter.key} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="font-semibold">{meter.label}</h3>
                  <p className="text-sm tabular-nums">
                    {`${formatCompact(meter.used)} of ${formatCompact(meter.included)} ${meter.unit}`}
                  </p>
                </div>
                <p className="text-sm text-pretty text-muted">{meter.description}</p>
                <ProgressBar
                  value={Math.min(meter.used, meter.included)}
                  max={meter.included}
                  label={`${meter.label} used`}
                />
                <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted tabular-nums">
                  <span>{`${share(meter.used, meter.included)} used`}</span>
                  <span>{`Then ${formatUsd(meter.usdPerMillion, 3)} per million ${meter.unit}`}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <InlineAlert status="warning">
            Live usage is unavailable right now, so only the fixed bills are shown.
          </InlineAlert>
        )}
      </section>

      <section aria-labelledby="costs-bill" className="flex flex-col gap-3">
        <SectionHeading id="costs-bill">Monthly bill</SectionHeading>
        <dl className={PANEL_CLASS}>
          {costs.lines.map((line) => (
            <div key={line.label} className="flex items-baseline justify-between gap-4 p-4">
              <dt className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{line.label}</span>
                <span className="text-sm text-pretty text-muted">{line.note}</span>
              </dt>
              <dd className="font-semibold tabular-nums">{formatUsd(line.monthlyUsd)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 p-4">
            <dt className="font-semibold">Total per month</dt>
            <dd className="font-display text-2xl font-semibold tabular-nums">
              {formatUsd(costs.totalUsd)}
            </dd>
          </div>
        </dl>
      </section>

      {supportUrl && (
        <section
          aria-labelledby="costs-support"
          className={`flex flex-col items-start gap-3 ${cardClass("md", "bordered")}`}
        >
          <SectionHeading id="costs-support">Help cover the bill</SectionHeading>
          <p className="leading-relaxed text-pretty">
            {`If Betabook is useful to you, you can help cover the ${formatUsd(costs.totalUsd)} it costs to run each month.`}
          </p>
          <a
            href={supportUrl}
            target="_blank"
            rel="noreferrer"
            className={`${buttonVariants()} focus-visible:status-focused`}
          >
            Support Betabook
          </a>
          <p className="text-sm text-muted">
            Payments go toward these bills and aren’t tax-deductible.
          </p>
        </section>
      )}
    </div>
  );
}
