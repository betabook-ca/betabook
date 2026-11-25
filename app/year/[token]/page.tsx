import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { expiredLinkCard } from "@/components/expired-link-card";
import { signUpCard } from "@/components/sign-up-card";
import { AppLink } from "@/components/ui/app-link";
import { EYEBROW_CLASS } from "@/components/ui/eyebrow";
import { PageTitle } from "@/components/ui/typography";
import { UserAvatar } from "@/components/ui/user-avatar";
import { YearReviewStory } from "@/components/year-in-review/year-review-story";
import { getDb } from "@/db/client";
import { getSharedYearReview, getYearReviewData } from "@/db/queries";
import { goalToday } from "@/lib/goals";
import { requestMemo } from "@/lib/request-memo";
import { getRequestTimezone } from "@/lib/request-timezone";
import { sharedYearReviewMetadata } from "@/lib/seo";
import { getMemberSession, getViewerGradePreferences } from "@/lib/session";
import { parseShareToken } from "@/lib/share-token";
import { buildYearInReview } from "@/lib/year-in-review";
import { yearReviewPath, yearReviewSharePath } from "@/lib/year-review-share";

type Props = { params: Promise<{ token: string }> };

/** One read per request for the page and its metadata. */
const getSharedYearByToken = requestMemo(async (token: string) =>
  getSharedYearReview(await getDb(), token),
);

const FALLBACK_METADATA: Metadata = { title: "Shared year in review", robots: { index: false } };

/** A dead or expired link previews as nothing. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const token = parseShareToken((await params).token);
  if (!token) return FALLBACK_METADATA;
  const access = await getSharedYearByToken(token);
  return access.status === "visible"
    ? sharedYearReviewMetadata(access.owner.name, access.year)
    : FALLBACK_METADATA;
}

/**
 * A year-in-review link: the recap as its owner sees it, without the owner's
 * actions and without tagged partners, who never saw the share dialog.
 * Holding the token is the permission; every read re-checks it in SQL.
 */
export default async function SharedYearReviewPage({ params }: Props) {
  const token = parseShareToken((await params).token);
  if (!token) notFound();
  const [access, session, timezone] = await Promise.all([
    getSharedYearByToken(token),
    getMemberSession(),
    getRequestTimezone(),
  ]);
  if (access.status === "hidden") notFound();
  const ownerId = access.status === "expired" ? access.ownerId : access.owner.id;
  if (session?.user.id === ownerId) redirect(yearReviewPath(ownerId, access.year));
  if (access.status === "expired") return expiredLinkCard("recaps");

  const { owner, year } = access;
  const [data, prefs] = await Promise.all([
    getYearReviewData(await getDb(), { ownerId: owner.id, token }, year),
    getViewerGradePreferences(),
  ]);
  const review = buildYearInReview({ year, today: goalToday(timezone), ...data }, prefs);

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <header className="flex min-w-0 items-center gap-3">
        <UserAvatar name={owner.name} image={owner.image} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className={EYEBROW_CLASS}>Year in review</span>
          <PageTitle className="min-w-0 break-words">
            <AppLink href={`/users/${owner.id}`}>{owner.name}</AppLink>&apos;s {year} in climbing
          </PageTitle>
        </div>
      </header>
      <YearReviewStory review={review} ownerId={owner.id} ownerName={owner.name} mode="shared" />
      {!session &&
        signUpCard({
          ownerName: owner.name,
          path: yearReviewSharePath(token),
          pitch: "Log your own climbing, and get your own year in review every December.",
        })}
    </div>
  );
}
