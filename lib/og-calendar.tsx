import type { ReactElement } from "react";

import { OG_FONT } from "@/lib/og-fonts";
import { OG_COLORS } from "@/lib/og-theme";
import type { SocialCardCalendar } from "@/lib/social-card";

const MS_PER_DAY = 86_400_000;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const FILLS = ["#d9e5db", "#f7cbbf", "#f2af9d", "#ec927b", "#d9604c"];

/** A combined, Monday-first year calendar. SVG keeps 365 cells crisp in a
 * 1080px share image without relying on CSS grid support in Satori. */
export function OgActivityCalendar({ calendar }: { calendar: SocialCardCalendar }): ReactElement {
  // oxlint-disable-next-line react/capitalized-calls -- Date.UTC is a JavaScript built-in
  const jan1 = Date.UTC(calendar.year, 0, 1);
  // oxlint-disable-next-line react/capitalized-calls -- Date.UTC is a JavaScript built-in
  const daysInRange =
    Math.round((Date.parse(`${calendar.throughDate}T00:00:00Z`) - jan1) / MS_PER_DAY) + 1;
  const offset = (new Date(jan1).getUTCDay() + 6) % 7;
  const weeks = Math.ceil((offset + daysInRange) / 7);
  const gap = 3;
  // Early in the year, a handful of weeks must not grow into a poster-tall grid.
  const cell = Math.min(20, Math.floor((900 - (weeks - 1) * gap) / weeks));
  const width = weeks * cell + (weeks - 1) * gap;
  const height = 7 * cell + 6 * gap;
  const max = Math.max(1, ...Object.values(calendar.counts));
  const cells = Array.from({ length: daysInRange }, (_, index) => {
    const iso = new Date(jan1 + index * MS_PER_DAY).toISOString().slice(0, 10);
    const count = calendar.counts[iso] ?? 0;
    const level = count === 0 ? 0 : Math.max(1, Math.ceil((count / max) * 4));
    const month = Number(iso.slice(5, 7));
    return {
      iso,
      x: Math.floor((offset + index) / 7) * (cell + gap),
      y: ((offset + index) % 7) * (cell + gap),
      fill:
        calendar.highlightMonth !== null && month !== calendar.highlightMonth && count > 0
          ? "#a3c29c"
          : FILLS[level],
    };
  });

  return (
    <div style={{ display: "flex", width: "100%", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: OG_FONT.body,
            fontWeight: 500,
            fontSize: 22,
            letterSpacing: 3,
            color: OG_COLORS.ink,
          }}
        >
          CLIMBING DAYS
        </span>
        <span
          style={{
            fontFamily: OG_FONT.body,
            fontWeight: 500,
            fontSize: 20,
            letterSpacing: 1,
            color: "rgba(0,0,0,0.6)",
          }}
        >
          {calendar.label}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 16,
          padding: "18px",
          borderRadius: 22,
          background: "rgba(0,0,0,0.045)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          {MONTHS.slice(0, Number(calendar.throughDate.slice(5, 7))).map((month) => (
            <span
              key={month}
              style={{
                fontFamily: OG_FONT.body,
                fontWeight: 500,
                fontSize: 15,
                color: "rgba(0,0,0,0.55)",
              }}
            >
              {month}
            </span>
          ))}
        </div>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: "flex" }}
        >
          {cells.map((day) => (
            <rect
              key={day.iso}
              x={day.x}
              y={day.y}
              width={cell}
              height={cell}
              rx={3}
              fill={day.fill}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
