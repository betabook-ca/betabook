import { buttonVariants } from "@heroui/react";

import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { signUpUrl } from "@/lib/sign-in-redirect";
import { SITE_NAME } from "@/lib/site";

/** The invitation under a shared page, for a reader with no account.
 *
 * Returns the element rather than being a component, so the shared view's
 * own tree still carries the words: the share-exposure tests serialize that
 * tree one component level deep. */
export function signUpCard({
  ownerName,
  path,
  pitch,
}: {
  ownerName: string;
  /** Where sign-up should return to, so the invitation lands back here. */
  path: string;
  /** What the reader could keep here, after the one-line description. */
  pitch: string;
}) {
  return (
    <section
      aria-label={`Climb with ${ownerName} on ${SITE_NAME}`}
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${cardClass("md", "bordered")}`}
    >
      <p className="text-sm text-muted">
        {`${SITE_NAME} is a climbing logbook and crag database. ${pitch}`}
      </p>
      <AppLink href={signUpUrl(path)} className={`${buttonVariants()} shrink-0`}>
        Sign up
      </AppLink>
    </section>
  );
}
