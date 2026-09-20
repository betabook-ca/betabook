import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import type { ReactElement } from "react";

import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { getDb } from "@/db/client";
import { getShareLinkOwner, getUserSendsSummary, type UserStatsSummary } from "@/db/queries";
import { getBaseUrl } from "@/lib/app-url";
import { OG_COLORS, OG_DISCIPLINE_COLOR } from "@/lib/og-theme";
import { parseProfileShareToken } from "@/lib/profile-share";
import { OG_IMAGE, SITE_NAME } from "@/lib/site";
import { getAvatarPhoto, getUserInitials } from "@/lib/user-initials";

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
  const avatar = getAvatarPhoto(owner.image);
  const avatarUrl = avatar ? new URL(avatar.url, await getBaseUrl()).href : null;
  return { name: owner.name, initials: getUserInitials(owner.name), avatarUrl, summary };
}

function StatTile({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: "rgba(0,0,0,0.05)",
        borderRadius: 20,
        padding: "20px 28px",
        minWidth: 170,
      }}
    >
      <span style={{ fontSize: 40, fontWeight: 700, color: OG_COLORS.ink }}>{value}</span>
      <span
        style={{
          fontSize: 18,
          color: "rgba(0,0,0,0.55)",
          textTransform: "uppercase",
          letterSpacing: 2,
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** The 1200×630 card itself — pure so layout can be sanity-checked without
 * spinning up `ImageResponse`. */
export function profileShareCardElement(card: ProfileShareCard): ReactElement {
  const { summary } = card;
  const accent = summary.mostLoggedDiscipline
    ? OG_DISCIPLINE_COLOR[summary.mostLoggedDiscipline.type]
    : OG_COLORS.primary;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: OG_COLORS.paper,
        padding: 64,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            display: "flex",
            width: 26,
            height: 26,
            borderRadius: 9999,
            background: OG_COLORS.coral,
          }}
        />
        <span style={{ fontSize: 30, fontWeight: 700, color: OG_COLORS.ink, letterSpacing: 1 }}>
          {SITE_NAME.toLowerCase()}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 44 }}>
        {card.avatarUrl ? (
          // next/og's ImageResponse (satori) has no use for next/image, and this
          // never reaches a real accessibility tree — it's rasterized to a PNG.
          // oxlint-disable-next-line next/no-img-element
          <img
            src={card.avatarUrl}
            alt=""
            width={176}
            height={176}
            style={{ borderRadius: 9999, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: 176,
              height: 176,
              borderRadius: 9999,
              background: accent,
              color: OG_COLORS.paper,
              fontSize: 64,
              fontWeight: 700,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {card.initials}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 60, fontWeight: 700, color: OG_COLORS.ink, lineHeight: 1.05 }}>
            {card.name}
          </span>
          <span style={{ fontSize: 26, color: "rgba(0,0,0,0.6)" }}>
            Climbing logbook & crag database
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 20 }}>
        <StatTile label="Sends" value={String(summary.sendCount)} />
        <StatTile label="Areas" value={String(summary.areaCount)} />
        <StatTile
          label={
            summary.mostLoggedDiscipline
              ? `Peak · ${DISCIPLINE_LABELS[summary.mostLoggedDiscipline.type]}`
              : "Peak grade"
          }
          value={summary.peakGrade ?? "—"}
        />
      </div>
    </div>
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
  return new ImageResponse(profileShareCardElement(card), IMAGE_SIZE);
}
