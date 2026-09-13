import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { SectionHeading } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    // max-w-2xl rather than inheriting the shell's width: the root layout's
    // <main> is max-w-7xl, which is right for climb lists and roughly twice a
    // comfortable line length for running text.
    //
    // gap, not per-element margins: @heroui/styles brings Tailwind's preflight,
    // which zeroes every block margin, so this flex column is the whole
    // spacing system for the page. Headings then add `mt-4` on top of the gap
    // — margins don't collapse in a flex container, so that opens a real
    // section break instead of being swallowed by the larger of the two.
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1>
        <Brand variant="lockup" className="mx-auto w-full max-w-90" />
      </h1>

      <SectionHeading className="mt-4">What is Betabook</SectionHeading>
      <p className="leading-relaxed text-pretty">
        Betabook is a journal for your personal climbing journey. It is not just for your sends, but
        also for logging your sessions, your failures, and most importantly, your progress over the
        years. Betabook is a place to share your climbing experiences with others, and to learn from
        the experiences of others. It is a place to find beta, to find inspiration, and to find
        community.
      </p>

      <SectionHeading className="mt-4">Not a Guidebook or Social Media</SectionHeading>
      <p className="leading-relaxed text-pretty">
        Betabook does not aim to become a guidebook site or a social media platform. While there is
        detailed info on the platform to help find and share crags, the aim of this site is not to
        become a guidebook replacement, but to simply be a gathering place where users can share
        what they’re climbing.
      </p>

      <SectionHeading className="mt-4">For the Community</SectionHeading>
      <p className="leading-relaxed text-pretty">
        The success of Betabook depends on its community. It will only hold value as users join,
        keep information on this site accurate, and log sessions to help drive consensus on climbs.
        Because this project relies on the community, its core philosophy is community-driven as
        well.
      </p>
      <p className="leading-relaxed text-pretty">
        The source code for Betabook remains public and available on{" "}
        {/* External link: a plain anchor, not AppLink — next/link has nothing
         * to prefetch off-site, so .link and the focus ring are re-added by
         * hand (AppLink does that for itself). `inline` matters: .link is
         * display:inline-flex, an atomic inline box that can't break across
         * lines mid-sentence. `underline` because a link inside a sentence has
         * only its colour to identify it, and colour alone isn't a
         * distinguishing cue (WCAG 1.4.1). */}
        <a
          href="https://github.com/betabook-ca/betabook"
          target="_blank"
          rel="noreferrer"
          className="link inline underline focus-visible:status-focused"
        >
          GitHub
        </a>
        . Not only can anyone use this to create their own Betabook, they can also contribute to the
        growth of this site, building features that they want to see and fixing issues they
        encounter.
      </p>

      <SectionHeading className="mt-4">Keeping this site free</SectionHeading>
      <p className="leading-relaxed text-pretty">
        I also built this to be as cheap as possible so as to avoid charging any user fees or
        displaying ads. This is why Betabook doesn’t support any image or video uploads as those can
        get expensive quickly. You can read a writeup of the{" "}
        <a
          href="https://gist.github.com/smwoo/23844c3ae239e6f22ddb96a3c660afe5#5-current-monthly-bill"
          target="_blank"
          rel="noreferrer"
          className="link inline underline focus-visible:status-focused"
        >
          pricing projection here
        </a>
        . Ideally, we can keep costs under $10/month at which point I can either foot the bill
        myself or open a donation drive to cover server costs. If activity grows to a point where
        this isn’t sustainable then I’m sure we can work out a new funding model then.
      </p>

      <SectionHeading className="mt-4">Filling in the Beta</SectionHeading>
      <p className="leading-relaxed text-pretty">
        Currently, to build this site I’ve programmatically seeded the database with climbs and
        their known physical locations. However I haven’t added any detailed descriptions as that is
        intellectual property and should be written in one’s own words. If you come across a climb
        or area missing a description please contribute.
      </p>

      <p className="leading-relaxed text-pretty">
        Thanks for choosing Betabook as your logging platform of choice and happy sending.
      </p>
    </div>
  );
}
