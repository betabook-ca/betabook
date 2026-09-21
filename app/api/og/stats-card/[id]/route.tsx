import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { getJournalSessionsForAnalytics, getUserSendsForAnalytics } from "@/db/queries";
import { withApiSession } from "@/lib/api-session";
import { ogFonts } from "@/lib/og-fonts";
import { socialCardElement, type SocialCardOwner } from "@/lib/og-recap";
import { buildSocialCardStats, isSocialCardPeriod, type SocialCardPeriod } from "@/lib/social-card";
import { getUserInitials, resolveAvatarUrl } from "@/lib/user-initials";

export const IMAGE_SIZE = { width: 1080, height: 1350 };

type RouteParams = { params: Promise<{ id: string }> };

export function todayInTimezone(timezone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone ?? "UTC" }).format(new Date());
}

/** Split from GET because vitest-pool-workers cannot import ImageResponse's
 * dynamic module. The route itself is also exercised against the real app. */
export async function loadSocialCardStats(id: string, period: SocialCardPeriod) {
  const db = await getDb();
  const [sends, sessions, { cf }] = await Promise.all([
    getUserSendsForAnalytics(db, id, id),
    getJournalSessionsForAnalytics(db, id, id),
    getCloudflareContext({ async: true }),
  ]);
  return buildSocialCardStats(sends, sessions, period, todayInTimezone(cf?.timezone));
}

/** Owner-only: this is an export of the signed-in climber's own stats. */
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
