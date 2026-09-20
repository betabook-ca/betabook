import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import type { ReactElement } from "react";

import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { getDb } from "@/db/client";
import { getJournalSessionsForAnalytics, getUserSendsForAnalytics } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { BetabookMark, CardFrame, Tile } from "@/lib/og-elements";
import { ogFonts, OG_FONT } from "@/lib/og-fonts";
import { OG_COLORS, OG_DISCIPLINE_COLOR } from "@/lib/og-theme";
import {
  buildSocialCardStats,
  isSocialCardPeriod,
  type SocialCardPeriod,
  type SocialCardStats,
} from "@/lib/social-card";

export const IMAGE_SIZE = { width: 1080, height: 1350 };

type RouteParams = { params: Promise<{ id: string }> };

export function todayInTimezone(timezone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone ?? "UTC" }).format(new Date());
}

/** Split from `GET` for the same reason as `loadProfileShareCard`: the data
 * and period logic is unit-testable, `ImageResponse` itself is not (see
 * app/api/og/profile-share/[token]/route.tsx). */
export async function loadSocialCardStats(
  id: string,
  period: SocialCardPeriod,
): Promise<SocialCardStats> {
  const db = await getDb();
  const [sends, sessions, { cf }] = await Promise.all([
    getUserSendsForAnalytics(db, id, id),
    getJournalSessionsForAnalytics(db, id, id),
    getCloudflareContext({ async: true }),
  ]);
  return buildSocialCardStats(sends, sessions, period, todayInTimezone(cf?.timezone));
}

/** The small accent-colored dot before an eyebrow line — the one spot on
 * this card that still uses the climber's dominant discipline color now
 * that the header lockup is the real (uncolored) logo mark, not a colored
 * stand-in for it. */
function AccentDot({ color }: { color: string }): ReactElement {
  return (
    <div
      style={{ display: "flex", width: 12, height: 12, borderRadius: 9999, background: color }}
    />
  );
}

/** The 1080×1350 recap card — pure so layout can be sanity-checked without
 * spinning up `ImageResponse`. */
export function socialCardElement(name: string, stats: SocialCardStats): ReactElement {
  const accent = stats.scope ? OG_DISCIPLINE_COLOR[stats.scope] : OG_COLORS.primary;
  if (stats.scope === null) {
    return (
      <CardFrame padding={72}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", opacity: 0.14 }}>
            <BetabookMark size={140} color={OG_COLORS.ink} sunColor={OG_COLORS.ink} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <span
              style={{
                fontFamily: OG_FONT.body,
                fontWeight: 500,
                fontSize: 28,
                color: "rgba(0,0,0,0.56)",
                textTransform: "uppercase",
                letterSpacing: 3,
              }}
            >
              {stats.periodLabel}
            </span>
            <span
              style={{
                fontFamily: OG_FONT.display,
                fontWeight: 700,
                fontSize: 64,
                color: OG_COLORS.ink,
                lineHeight: 1.1,
              }}
            >
              No sends logged yet
            </span>
            <span
              style={{
                fontFamily: OG_FONT.body,
                fontWeight: 500,
                fontSize: 30,
                color: "rgba(0,0,0,0.6)",
              }}
            >
              {name}
            </span>
          </div>
        </div>
      </CardFrame>
    );
  }
  return (
    <CardFrame padding={72} align="start">
      <div style={{ display: "flex", flexDirection: "column", gap: 64 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <AccentDot color={accent} />
            <span
              style={{
                fontFamily: OG_FONT.body,
                fontWeight: 500,
                fontSize: 26,
                color: "rgba(0,0,0,0.56)",
                textTransform: "uppercase",
                letterSpacing: 3,
              }}
            >
              {`${stats.periodLabel} · ${DISCIPLINE_LABELS[stats.scope]}`}
            </span>
          </div>
          <span
            style={{
              fontFamily: OG_FONT.display,
              fontWeight: 700,
              fontSize: 200,
              color: accent,
              lineHeight: 1,
            }}
          >
            {stats.sendCount}
          </span>
          <span
            style={{
              fontFamily: OG_FONT.body,
              fontWeight: 500,
              fontSize: 40,
              color: OG_COLORS.ink,
            }}
          >
            {`${stats.sendCount === 1 ? "send" : "sends"} · ${name}`}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", gap: 24 }}>
            <Tile label="Days out" value={String(stats.daysOut)} />
            <Tile
              label="Hardest"
              value={stats.hardest?.label ?? "—"}
              sub={stats.hardest?.climbName}
            />
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <Tile label="Areas" value={String(stats.areaCount)} sub={stats.topArea?.name} />
            <Tile
              label="Flash rate"
              value={stats.flashPct != null ? `${stats.flashPct}%` : "—"}
              sub={
                stats.longestStreak != null && stats.longestStreak > 1
                  ? `${stats.longestStreak}-day streak`
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </CardFrame>
  );
}

/** Owner-only, like the QR/link download tools on the account page: this is
 * "export a card about my own stats to share," not a general per-profile
 * view, so it skips `canViewUser`'s friends/members visibility entirely. */
export const GET = withApiSession(async (session, request: Request, { params }: RouteParams) => {
  const { id } = await params;
  if (session.user.id !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const requested = new URL(request.url).searchParams.get("period");
  const period = isSocialCardPeriod(requested) ? requested : "year";

  const stats = await loadSocialCardStats(id, period);
  return new ImageResponse(socialCardElement(session.user.name, stats), {
    ...IMAGE_SIZE,
    fonts: ogFonts(),
  });
});
