import type { Metadata } from "next";

import { ContactForm } from "@/components/contact-form";
import { PageTitle } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Contact",
};

// No session read here on purpose: prefilling from the server would pull in
// headers() and make the whole page dynamic for the sake of one field. The
// form reads the session on the client, the way the header's menu does.
export default function ContactPage() {
  return (
    // Same measure as /about — the shell's <main> is max-w-7xl, which is
    // right for climb lists and about twice a comfortable line length for
    // running text or a form.
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <PageTitle>Contact</PageTitle>

      <p className="text-lg leading-relaxed text-pretty text-muted">
        Found a climb with the wrong grade, an area in the wrong place, or something that plainly
        doesn&apos;t work? Say so here.
      </p>

      <p className="leading-relaxed text-pretty">
        You don&apos;t need an account. Leave an email and I&apos;ll reply to it. If you&apos;d
        rather file it where other people can see it, the{" "}
        {/* External link: a plain anchor, not AppLink — next/link has nothing
         * to prefetch off-site, so .link and the focus ring are re-added by
         * hand. `inline` matters: .link is display:inline-flex, an atomic
         * inline box that can't break across lines mid-sentence. */}
        <a
          href="https://github.com/smwoo/betabook/issues"
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
