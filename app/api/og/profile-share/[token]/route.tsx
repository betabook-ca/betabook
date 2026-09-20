import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import type { ReactElement } from "react";

import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { getDb } from "@/db/client";
import { getShareLinkOwner, getUserSendsSummary, type UserStatsSummary } from "@/db/queries";
import { getBaseUrl } from "@/lib/app-url";
import { Avatar, CardFrame, Tile } from "@/lib/og-elements";
import { ogFonts, OG_FONT } from "@/lib/og-fonts";
import { OG_COLORS, OG_DISCIPLINE_COLOR } from "@/lib/og-theme";
import { parseProfileShareToken } from "@/lib/profile-share";
import { OG_IMAGE } from "@/lib/site";
import { getUserInitials, resolveAvatarUrl } from "@/lib/user-initials";

export const IMAGE_SIZE = { width: 1200, height: 630 };

type ProfileShareCard = {
  name: string;
  initials: string;
  avatarUrl: string | null;
  summary: UserStatsSummary;
};

/** Re-validates the token and gathers everything the card renders. Split
 * from `GET` so the authorization/privacy path is unit-testable:
 * `vitest-pool-workers` cannot import `ImageResponse` itself — `next/og`
 * swaps in a node vs. edge implementation at a path its module loader can't
 * resolve statically (a known `@cloudflare/vitest-pool-workers` limitation,
 * unrelated to this app). Verified instead by `opennextjs-cloudflare build`
 * + `pnpm preview`. */
export async function loadProfileShareCard(rawToken: string): Promise<ProfileShareCard | null> {
  const token = parseProfileShareToken(rawToken);
  if (!token) return null;
  const db = await getDb();
  const owner = await getShareLinkOwner(db, token);
  if (!owner) return null;

  const summary = await getUserSendsSummary(db, owner.id);
  const avatarUrl = await resolveAvatarUrl(owner.image);
  return { name: owner.name, initials: getUserInitials(owner.name), avatarUrl, summary };
}

const AVATAR_SIZE = 176;
const AVATAR_RING = 6;

/** The 1200×630 card itself — pure so layout can be sanity-checked without
 * spinning up `ImageResponse`. */
export function profileShareCardElement(card: ProfileShareCard): ReactElement {
  const { summary } = card;
  const accent = summary.mostLoggedDiscipline
    ? OG_DISCIPLINE_COLOR[summary.mostLoggedDiscipline.type]
    : OG_COLORS.primary;
  return (
    <CardFrame padding={64}>
      <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 44 }}>
          <Avatar
            photo={card.avatarUrl}
            initials={card.initials}
            size={AVATAR_SIZE}
            color={accent}
            ringWidth={AVATAR_RING}
          />
          <span
            style={{
              fontFamily: OG_FONT.display,
              fontWeight: 700,
              fontSize: 64,
              color: OG_COLORS.ink,
              lineHeight: 1.05,
            }}
          >
            {card.name}
          </span>
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <Tile label="Sends" value={String(summary.sendCount)} />
          <Tile label="Areas" value={String(summary.areaCount)} />
          <Tile
            label={
              summary.mostLoggedDiscipline
                ? `Peak · ${DISCIPLINE_LABELS[summary.mostLoggedDiscipline.type]}`
                : "Peak grade"
            }
            value={summary.peakGrade ?? "—"}
            tint={summary.mostLoggedDiscipline ? accent : undefined}
          />
        </div>
      </div>
    </CardFrame>
  );
}

/** Public and session-free like the share link it illustrates: the token is
 * re-validated on every request (`loadProfileShareCard`), so this exposes
 * nothing the link itself would not already show a signed-out visitor. An
 * invalid, expired, or reset token falls back to the sitewide card instead
 * of a broken image or an error. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const card = await loadProfileShareCard(token);
  if (!card) return NextResponse.redirect(new URL(OG_IMAGE.url, await getBaseUrl()));
  return new ImageResponse(profileShareCardElement(card), { ...IMAGE_SIZE, fonts: ogFonts() });
}
