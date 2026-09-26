import { cardClass } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/typography";
import { SITE_NAME } from "@/lib/site";

/** What a dead share link answers with. Described as a state of the link
 * rather than of the thing behind it: the reader is not being refused, and
 * nothing about the climber is disclosed either way.
 *
 * Returns the element rather than being a component, so the page's own tree
 * still carries the words: the share-exposure tests serialize that tree one
 * component level deep. */
export function expiredLinkCard(noun: "projects" | "trips") {
  return (
    <section aria-label="Expired link" className={`flex flex-col gap-2 ${cardClass("md")}`}>
      <PageTitle>This link has expired</PageTitle>
      <p className="text-sm text-muted">
        {`Shared ${noun} on ${SITE_NAME} can be set to expire. Ask the climber for a new link.`}
      </p>
    </section>
  );
}
