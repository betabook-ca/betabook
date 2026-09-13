import type { ClimberOverview } from "@/db/queries/climber-overview";
import { formatCount } from "@/lib/format";
import { formatDate } from "@/lib/format-date";

const MONTH_NAME = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

export function describeClimber({ sendCount, areaCount, daysOut, firstYear }: ClimberOverview) {
  const days = daysOut ? formatCount(daysOut, "day out", "days out") : null;
  const log =
    sendCount > 0
      ? `${formatCount(sendCount, "send")} across ${formatCount(areaCount, "area")}${days ? `, ${days}` : ""}.`
      : `No sends logged yet${days ? `, ${days}` : ""}.`;
  return firstYear ? `Climbing since ${firstYear}. ${log}` : log;
}

/** Days out when the journal is readable, sending days otherwise. */
export function describeRecency({ daysOut, lastOut, daysThisMonth, month }: ClimberOverview) {
  if (!lastOut) return null;
  const journal = daysOut !== null;
  const last = `${journal ? "Last out" : "Last sent"} ${formatDate(lastOut)}.`;
  if (daysThisMonth === 0) return last;
  const days = journal
    ? formatCount(daysThisMonth, "day out", "days out")
    : formatCount(daysThisMonth, "sending day");
  return `${last} ${days} in ${MONTH_NAME.format(new Date(`${month}-01T00:00:00Z`))}.`;
}
