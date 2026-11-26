import { YearReviewBanner } from "@/components/year-in-review/year-review-banner";
import { yearReviewAlwaysOpen } from "@/lib/year-review-env";

/** Reads the testing override on the server, where the Worker's variables
 * live, so the root layout itself stays free of session reads. */
export async function YearReviewBannerSlot() {
  return <YearReviewBanner alwaysOpen={await yearReviewAlwaysOpen()} />;
}
