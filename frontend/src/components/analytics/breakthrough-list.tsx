import { Grade } from "@/components/climbing/grade";
import { ListRow } from "@/components/ui/list-row";
import { RowList } from "@/components/ui/row-list";
import { formatDate } from "@/lib/format-date";
import { climbHref } from "@/lib/slug";
import { formatDaySpan, type Breakthrough } from "@/lib/user-analytics";

export function BreakthroughList({ breakthroughs }: { breakthroughs: Breakthrough[] }) {
  if (breakthroughs.length === 0) return null;

  return (
    <RowList>
      {breakthroughs.map((breakthrough) => (
        <ListRow
          key={`${breakthrough.type}-${breakthrough.grade}`}
          as="li"
          density="flush"
          className="first:pt-0 last:pb-0"
          leading={<Grade className="w-11">{breakthrough.label}</Grade>}
          title={breakthrough.climbName}
          href={climbHref(breakthrough.climbId, breakthrough.climbName)}
          trailing={
            <>
              <div className="text-sm text-foreground">{formatDate(breakthrough.dateSent)}</div>
              <div className="text-xs text-muted">
                {breakthrough.waitDays == null
                  ? "first"
                  : `after ${formatDaySpan(breakthrough.waitDays)}`}
              </div>
            </>
          }
        />
      ))}
    </RowList>
  );
}
