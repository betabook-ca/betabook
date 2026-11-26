import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { memberMetadata, resolveProfilePage } from "@/app/users/[id]/profile-shell";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { goalToday } from "@/lib/goals";
import { getRequestTimezone } from "@/lib/request-timezone";
import { recapYear } from "@/lib/year-in-review";
import { yearReviewPath } from "@/lib/year-review-share";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return memberMetadata(await resolveProfilePage(id, "owner"), () => "Year in review");
}

/** The recap shows one year at a time: last year until March, then this one. */
export default async function YearReviewIndexPage({ params }: Props) {
  const { id } = await params;
  const resolved = await resolveProfilePage(id, "owner");
  if (!resolved.signedIn) return <CurrentPageAuthCallout />;
  if (!resolved.ok) notFound();
  const today = goalToday(await getRequestTimezone());
  redirect(yearReviewPath(resolved.user.id, recapYear(today)));
}
