import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { memberMetadata, resolveProfilePage } from "@/app/users/[id]/profile-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { AppLink } from "@/components/ui/app-link";
import { EYEBROW_CLASS } from "@/components/ui/eyebrow";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { PageTitle } from "@/components/ui/typography";
import { YearReviewShareLink } from "@/components/year-in-review/year-review-share-link";
import { YearReviewFootnote, YearReviewStory } from "@/components/year-in-review/year-review-story";
import { getDb } from "@/db/client";
import { getYearReviewData, getYearReviewShareForOwner, getYearReviewYears } from "@/db/queries";
import { getBaseUrl } from "@/lib/app-url";
import { goalToday } from "@/lib/goals";
import { getRequestTimezone } from "@/lib/request-timezone";
import { getViewerGradePreferences } from "@/lib/session";
import { buildYearInReview, parseRecapYear } from "@/lib/year-in-review";
import { yearShareCards } from "@/lib/year-in-review/share-cards";
import { yearReviewPath } from "@/lib/year-review-share";

type Props = { params: Promise<{ id: string; year: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, year } = await params;
  return memberMetadata(await resolveProfilePage(id, "owner"), () => `${year} in review`);
}

/** The owner's recap of one year. Owner-only: a link at `/year/{token}` is
 * how anyone else sees it. */
export default async function YearReviewPage({ params }: Props) {
  const { id, year: yearParam } = await params;
  const resolved = await resolveProfilePage(id, "owner");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const today = goalToday(await getRequestTimezone());
  const year = parseRecapYear(yearParam, Number(today.slice(0, 4)));
  if (year === null) notFound();
  const { user } = resolved;

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6">
      <Suspense fallback={<SkeletonListRows rows={8} />}>
        <YearReviewContent
          ownerId={user.id}
          ownerName={user.name}
          isPrivate={user.isPrivate}
          year={year}
          today={today}
        />
      </Suspense>
    </div>
  );
}

async function YearReviewContent({
  ownerId,
  ownerName,
  isPrivate,
  year,
  today,
}: {
  ownerId: string;
  ownerName: string;
  isPrivate: boolean;
  year: number;
  today: string;
}) {
  const db = await getDb();
  const [data, years, share, origin, prefs] = await Promise.all([
    getYearReviewData(db, { ownerId }, year),
    getYearReviewYears(db, ownerId),
    getYearReviewShareForOwner(db, ownerId, year),
    getBaseUrl(),
    getViewerGradePreferences(),
  ]);
  const review = buildYearInReview({ year, today, ...data }, prefs);
  const pickable = [...new Set([year, ...years])]
    .filter((option) => option <= Number(today.slice(0, 4)))
    .toSorted((a, b) => b - a);

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className={EYEBROW_CLASS}>Year in review</span>
            <PageTitle size="lg">Your {year} in climbing</PageTitle>
          </div>
          <YearReviewShareLink
            year={year}
            share={share}
            shareOrigin={origin}
            isPrivate={isPrivate}
          />
        </div>
        {pickable.length > 1 && (
          <nav aria-label="Years" className="flex flex-wrap gap-2 text-sm">
            {pickable.map((option) =>
              option === year ? (
                <span
                  key={option}
                  aria-current="page"
                  className="rounded-full bg-accent px-3 py-1 font-semibold text-accent-foreground"
                >
                  {option}
                </span>
              ) : (
                <AppLink
                  key={option}
                  href={yearReviewPath(ownerId, option)}
                  className="rounded-full bg-surface-secondary px-3 py-1"
                >
                  {option}
                </AppLink>
              ),
            )}
          </nav>
        )}
      </header>
      <YearReviewStory
        review={review}
        ownerId={ownerId}
        ownerName={ownerName}
        mode="owner"
        shareCards={yearShareCards(review, ownerName)}
      />
      <YearReviewFootnote review={review} ownerId={ownerId} />
    </>
  );
}
