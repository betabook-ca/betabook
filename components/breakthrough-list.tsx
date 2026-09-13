import { AppLink } from "@/components/ui/app-link";
import { Grade } from "@/components/ui/grade";
import { formatDate } from "@/lib/format-date";
import { climbHref } from "@/lib/slug";
import { formatDaySpan, type Breakthrough } from "@/lib/user-analytics";

export function BreakthroughList({ breakthroughs }: { breakthroughs: Breakthrough[] }) {
  if (breakthroughs.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y divide-separator">
      {breakthroughs.map((breakthrough) => (
        <li
          key={`${breakthrough.type}-${breakthrough.grade}`}
          className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          <Grade className="w-11 shrink-0">{breakthrough.label}</Grade>
          <div className="min-w-0 flex-1">
            <AppLink
              href={climbHref(breakthrough.climbId, breakthrough.climbName)}
              className="block text-sm text-foreground hover:underline"
            >
              {breakthrough.climbName}
            </AppLink>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm text-foreground tabular-nums">
              {formatDate(breakthrough.dateSent)}
            </div>
            <div className="text-xs text-muted">
              {breakthrough.waitDays == null
                ? "first"
                : `after ${formatDaySpan(breakthrough.waitDays)}`}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
