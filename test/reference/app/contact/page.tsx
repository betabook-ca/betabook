import type { Metadata } from "next";

import { ContactForm } from "@/components/contact-form";
import { READING_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import { PageTitle } from "@/components/ui/typography";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Contact us",
  description:
    "Report a wrong grade, a misplaced area or a bug, or send feedback about Betabook. No account needed.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col gap-4`}>
      <PageTitle>Contact us</PageTitle>

      <p className="text-lg leading-relaxed text-pretty text-muted">
        Found a climb with the wrong grade, an area in the wrong place, or something that plainly
        doesn&apos;t work? Say so here.
      </p>

      <p className="leading-relaxed text-pretty">
        You don&apos;t need an account. Leave an email to get a reply. If you&apos;d rather file it
        where other people can see it, the{" "}
        {/* External link: a plain anchor, not AppLink — next/link has nothing
         * to prefetch off-site, so .link and the focus ring are re-added by
         * hand. `inline` matters: .link is display:inline-flex, an atomic
         * inline box that can't break across lines mid-sentence. */}
        <a
          href="https://github.com/betabook-ca/betabook/issues"
          target="_blank"
          rel="noreferrer"
          className="link inline underline focus-visible:status-focused"
        >
          issue tracker
        </a>{" "}
        is open too.
      </p>

      <ContactForm />
    </div>
  );
}
