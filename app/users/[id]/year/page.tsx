import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { memberMetadata, resolveProfilePage } from "@/app/users/[id]/profile-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { getDb } from "@/db/client";
import { getYearReviewYears } from "@/db/queries";
import { goalToday } from "@/lib/goals";
import { getRequestTimezone } from "@/lib/request-timezone";
import { yearReviewWindow } from "@/lib/year-in-review";
import { yearReviewPath } from "@/lib/year-review-share";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return memberMetadata(await resolveProfilePage(id, "owner"), () => "Year in review");
}

/** The latest year with something logged, or this recap season's year (whose
 * core chapters then show their zero states). */
export default async function YearReviewIndexPage({ params }: Props) {
  const { id } = await params;
  const resolved = await resolveProfilePage(id, "owner");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const today = goalToday(await getRequestTimezone());
  const current = Number(today.slice(0, 4));
  // Newest first, so the first year not in the future is the latest.
  const latest = (await getYearReviewYears(await getDb(), resolved.user.id)).find(
    (year) => year <= current,
  );
  redirect(yearReviewPath(resolved.user.id, latest ?? yearReviewWindow(today, true) ?? current));
}
