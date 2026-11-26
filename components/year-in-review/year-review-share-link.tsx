"use client";

import { shareYearReview, unshareYearReview } from "@/actions";
import { ShareLinkButton } from "@/components/share-link-button";
import type { ShareLink } from "@/components/share-link-dialog";
import { YEAR_REVIEW_SHARE_SENTENCE, yearReviewSharePath } from "@/lib/year-review-share";

/** Share button and dialog for one year's recap, at `/year/{token}`. */
export function YearReviewShareLink({
  year,
  share,
  shareOrigin,
  isPrivate,
}: {
  year: number;
  /** The live link as the server last saw it, or null. */
  share: ShareLink;
  shareOrigin: string;
  isPrivate: boolean;
}) {
  return (
    <ShareLinkButton
      isPrivate={isPrivate}
      name={`your ${year} year in review`}
      sentence={YEAR_REVIEW_SHARE_SENTENCE}
      linkLabel="Year in review link"
      path={yearReviewSharePath}
      share={share}
      shareOrigin={shareOrigin}
      onShare={(expiry) => shareYearReview(year, expiry)}
      onUnshare={() => unshareYearReview(year)}
      stopDescription="The link stops working for everyone you sent it to. Your climbing log is untouched, and you can share the year again later with a new link."
    />
  );
}
