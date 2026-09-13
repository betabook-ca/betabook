import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { StatStrip } from "@/components/ui/stat-strip";
import type { UserStatsSummary } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { formatDate } from "@/lib/format-date";

export function UserSendSummary({ summary }: { summary: UserStatsSummary }) {
  return (
    <StatStrip
      cards={[
        {
          key: "profile",
          stats: [
            { label: "Sends", value: summary.sendCount },
            { label: "Areas", value: summary.areaCount },
            { label: "Peak grade", value: summary.peakGrade ?? "—" },
          ],
        },
        ...(summary.sendCount > 0
          ? [
              {
                key: "latest",
                stats: [
                  { label: "Latest send", value: formatDate(summary.latestSendDate) },
                  ...(summary.mostLoggedDiscipline
                    ? [
                        {
                          label: "Most logged",
                          value: `${DISCIPLINE_LABELS[summary.mostLoggedDiscipline.type]} · ${formatCount(summary.mostLoggedDiscipline.count, "send")}`,
                        },
                      ]
                    : []),
                ],
              },
            ]
          : []),
      ]}
    />
  );
}
