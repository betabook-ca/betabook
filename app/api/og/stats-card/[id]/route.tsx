import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import type { ReactElement } from "react";

import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { getDb } from "@/db/client";
import { getJournalSessionsForAnalytics, getUserSendsForAnalytics } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { OG_COLORS, OG_DISCIPLINE_COLOR } from "@/lib/og-theme";
import { SITE_NAME } from "@/lib/site";
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

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        flex: 1,
        background: "rgba(0,0,0,0.05)",
        borderRadius: 28,
        padding: "28px 32px",
      }}
    >
      <span
        style={{
          fontSize: 22,
          color: "rgba(0,0,0,0.55)",
          textTransform: "uppercase",
          letterSpacing: 2,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 52, fontWeight: 700, color: OG_COLORS.ink, lineHeight: 1.1 }}>
        {value}
      </span>
      {sub && (
        <span
          style={{
            fontSize: 20,
            color: "rgba(0,0,0,0.55)",
            maxWidth: 380,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

function CardFrame({ accent, children }: { accent: string; children: ReactElement }): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: OG_COLORS.paper,
        padding: 72,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{ display: "flex", width: 30, height: 30, borderRadius: 9999, background: accent }}
        />
        <span style={{ fontSize: 34, fontWeight: 700, color: OG_COLORS.ink, letterSpacing: 1 }}>
          {SITE_NAME.toLowerCase()}
        </span>
      </div>
      {children}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 24, color: "rgba(0,0,0,0.6)" }}>
          Climbing logbook & crag database
        </span>
        <span style={{ fontSize: 24, color: "rgba(0,0,0,0.6)" }}>betabook.ca</span>
      </div>
    </div>
  );
}

/** The 1080×1350 recap card — pure so layout can be sanity-checked without
 * spinning up `ImageResponse`. */
export function socialCardElement(name: string, stats: SocialCardStats): ReactElement {
  const accent = stats.scope ? OG_DISCIPLINE_COLOR[stats.scope] : OG_COLORS.primary;
  if (stats.scope === null) {
    return (
      <CardFrame accent={accent}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <span style={{ fontSize: 30, color: "rgba(0,0,0,0.6)" }}>{stats.periodLabel}</span>
          <span style={{ fontSize: 64, fontWeight: 700, color: OG_COLORS.ink, lineHeight: 1.1 }}>
            No sends logged yet
          </span>
          <span style={{ fontSize: 30, color: "rgba(0,0,0,0.6)" }}>{name}</span>
        </div>
      </CardFrame>
    );
  }
  return (
    <CardFrame accent={accent}>
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span
            style={{
              fontSize: 26,
              color: "rgba(0,0,0,0.55)",
              textTransform: "uppercase",
              letterSpacing: 3,
            }}
          >
            {`${stats.periodLabel} · ${DISCIPLINE_LABELS[stats.scope]}`}
          </span>
          <span style={{ fontSize: 140, fontWeight: 700, color: OG_COLORS.ink, lineHeight: 1 }}>
            {stats.sendCount}
          </span>
          <span style={{ fontSize: 40, color: OG_COLORS.ink }}>
            {`${stats.sendCount === 1 ? "send" : "sends"} · ${name}`}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", gap: 20 }}>
            <Tile label="Days out" value={String(stats.daysOut)} />
            <Tile
              label="Hardest"
              value={stats.hardest?.label ?? "—"}
              sub={stats.hardest?.climbName}
            />
          </div>
          <div style={{ display: "flex", gap: 20 }}>
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
  return new ImageResponse(socialCardElement(session.user.name, stats), IMAGE_SIZE);
});
