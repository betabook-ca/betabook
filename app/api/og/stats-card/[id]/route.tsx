import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import type { ReactElement } from "react";

import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { getDb } from "@/db/client";
import { getJournalSessionsForAnalytics, getUserSendsForAnalytics } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { Avatar, BetabookMark, CardFrame, Tile } from "@/lib/og-elements";
import { ogFonts, OG_FONT } from "@/lib/og-fonts";
import { OG_COLORS, OG_DISCIPLINE_COLOR, withAlpha } from "@/lib/og-theme";
import {
  buildSocialCardStats,
  isSocialCardPeriod,
  type SocialCardHardest,
  type SocialCardPeriod,
  type SocialCardStats,
} from "@/lib/social-card";
import { getUserInitials, resolveAvatarUrl } from "@/lib/user-initials";

export const IMAGE_SIZE = { width: 1080, height: 1350 };

type RouteParams = { params: Promise<{ id: string }> };

/** Just enough about the climber to name and identify them on the card —
 * split from `SocialCardStats`, which is the period's numbers, not the
 * owner's identity. */
export type SocialCardOwner = { name: string; initials: string; avatarUrl: string | null };

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

/** One discipline's hardest send, tinted by discipline — grades don't
 * compare across boulder/sport/trad, so a card combining all three names
 * each discipline's ceiling as its own badge instead of picking one to lead
 * with the way a single-discipline "Hardest" tile would. */
function GradeBadge({ hardest }: { hardest: SocialCardHardest }): ReactElement {
  const color = OG_DISCIPLINE_COLOR[hardest.type];
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        background: withAlpha(color, 0.14),
        borderRadius: 24,
        padding: "36px 20px",
      }}
    >
      <span
        style={{ fontFamily: OG_FONT.display, fontWeight: 700, fontSize: 52, color, lineHeight: 1 }}
      >
        {hardest.label}
      </span>
      <span
        style={{
          fontFamily: OG_FONT.body,
          fontWeight: 500,
          fontSize: 18,
          color: "rgba(0,0,0,0.56)",
          textTransform: "uppercase",
          letterSpacing: 2,
        }}
      >
        {DISCIPLINE_LABELS[hardest.type]}
      </span>
    </div>
  );
}

/** The 1080×1350 recap card — pure so layout can be sanity-checked without
 * spinning up `ImageResponse`. */
export function socialCardElement(owner: SocialCardOwner, stats: SocialCardStats): ReactElement {
  if (stats.sendCount === 0 && stats.daysOut === 0) {
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
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Avatar
                photo={owner.avatarUrl}
                initials={owner.initials}
                size={44}
                color={OG_COLORS.ink}
              />
              <span
                style={{
                  fontFamily: OG_FONT.body,
                  fontWeight: 500,
                  fontSize: 30,
                  color: "rgba(0,0,0,0.6)",
                }}
              >
                {owner.name}
              </span>
            </div>
          </div>
        </div>
      </CardFrame>
    );
  }
  return (
    <CardFrame padding={72}>
      <div style={{ display: "flex", flexDirection: "column", gap: 88 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                display: "flex",
                width: 12,
                height: 12,
                borderRadius: 9999,
                background: OG_COLORS.coral,
              }}
            />
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
              {stats.periodLabel}
            </span>
          </div>
          <span
            style={{
              fontFamily: OG_FONT.display,
              fontWeight: 700,
              fontSize: 224,
              color: OG_COLORS.coral,
              lineHeight: 1,
            }}
          >
            {stats.sendCount}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Avatar
              photo={owner.avatarUrl}
              initials={owner.initials}
              size={56}
              color={OG_COLORS.coral}
            />
            <span
              style={{
                fontFamily: OG_FONT.body,
                fontWeight: 500,
                fontSize: 40,
                color: OG_COLORS.ink,
              }}
            >
              {`${stats.sendCount === 1 ? "send" : "sends"} · ${owner.name}`}
            </span>
          </div>
        </div>
        {stats.hardest.length > 0 && (
          <div style={{ display: "flex", gap: 20 }}>
            {stats.hardest.map((hardest) => (
              <GradeBadge key={hardest.type} hardest={hardest} />
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 24 }}>
          <Tile label="Days out" value={String(stats.daysOut)} />
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

  const [stats, avatarUrl] = await Promise.all([
    loadSocialCardStats(id, period),
    resolveAvatarUrl(session.user.image),
  ]);
  const owner: SocialCardOwner = {
    name: session.user.name,
    initials: getUserInitials(session.user.name),
    avatarUrl,
  };
  return new ImageResponse(socialCardElement(owner, stats), { ...IMAGE_SIZE, fonts: ogFonts() });
});
