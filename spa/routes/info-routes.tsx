import { useParams } from "react-router";

import { Brand } from "@/components/brand";
import { ContactForm } from "@/components/contact-form";
import { ImportLandingPage } from "@/components/import-landing-page";
import {
  FeatureList,
  LandingHero,
  LandingLinks,
  LandingPage,
  LandingSection,
  QuestionList,
} from "@/components/landing-page";
import { LogbookPreview } from "@/components/logbook-preview";
import { RunningCosts } from "@/components/running-costs";
import { TermsContent } from "@/components/terms-content";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { READING_MAX_WIDTH_CLASS } from "@/components/ui/layout";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import { COSTS_PAGE, IMPORT_PAGES, LOGBOOK_PAGE } from "@/lib/landing-pages";
import { signUpUrl } from "@/lib/sign-in-redirect";
import { SUPPORT_URL } from "@/lib/site";
import { TERMS_VERSIONS, termsHref } from "@/lib/terms";

type InfoRouteKind =
  | "about"
  | "terms"
  | "terms-version"
  | "contact"
  | "climbing-logbook"
  | "kaya-import"
  | "sendage-import"
  | "mountain-project-import"
  | "costs";

function AboutContent() {
  return (
    <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col gap-4`}>
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
      <p className="leading-relaxed text-pretty">
        See the{" "}
        <AppLink href={LOGBOOK_PAGE.path} className="inline underline">
          logbook’s features
        </AppLink>
        , or import your sends from{" "}
        <AppLink href={IMPORT_PAGES.kaya.path} className="inline underline">
          KAYA
        </AppLink>
        ,{" "}
        <AppLink href={IMPORT_PAGES.sendage.path} className="inline underline">
          Sendage
        </AppLink>{" "}
        or{" "}
        <AppLink href={IMPORT_PAGES.mountainProject.path} className="inline underline">
          Mountain Project
        </AppLink>
        .
      </p>

      <section
        aria-labelledby="about-privacy"
        className={`mt-4 flex flex-col gap-3 ${cardClass("md", "bordered")}`}
      >
        <SectionHeading>
          <span id="about-privacy">Privacy controls</span>
        </SectionHeading>
        <ul className="flex list-disc flex-col gap-2 ps-5 leading-relaxed text-pretty">
          <li>
            Profiles, journals and stats need an account. Signed-out visitors see each climb’s
            latest 10 sends, without names unless send notes are set to Everyone.
          </li>
          <li>
            A private profile and its history are visible only to you. Friends and people you send
            requests to still see your name, and climb pages list your sends without it.
          </li>
          <li>
            You set one audience for your journal and finished goals and another for send notes,
            from Only me to Members. Send notes can also be set to Everyone, which shows them with
            your name to signed-out visitors.
          </li>
          <li>
            Your profile link and QR code show your name, photo, send stats and latest sends to
            anyone who has them. Resetting the link, or making your profile private, stops old links
            working.
          </li>
          <li>
            Only you can see your projects, unless you share one: anyone with the link sees your
            name, sessions, notes and send.
          </li>
          <li>
            You choose who else can see your trips, from Only me to Members. Your friends can read
            trip notes, regardless of your journal setting.
          </li>
          <li>Only you can export your sends.</li>
        </ul>
      </section>

      <SectionHeading className="mt-4">Not a guidebook or social media</SectionHeading>
      <p className="leading-relaxed text-pretty">
        Betabook does not aim to become a guidebook site or a social media platform. While there is
        detailed info on the platform to help find and share crags, the aim of this site is not to
        become a guidebook replacement, but to simply be a gathering place where users can share
        what they’re climbing.
      </p>

      <SectionHeading className="mt-4">For the community</SectionHeading>
      <p className="leading-relaxed text-pretty">
        The source code for Betabook remains public and available on{" "}
        <a
          href="https://github.com/betabook-ca/betabook"
          target="_blank"
          rel="noreferrer"
          className="link inline underline focus-visible:status-focused"
        >
          GitHub
        </a>
        . Anyone can contribute features and keep crag information accurate.
      </p>

      <SectionHeading className="mt-4">Keeping this site free</SectionHeading>
      <p className="leading-relaxed text-pretty">
        Betabook is built to be as cheap as possible to run, so it can stay free of user fees and
        ads. The{" "}
        <AppLink href={COSTS_PAGE.path} className="inline underline">
          cost transparency page
        </AppLink>{" "}
        shows this month’s Cloudflare usage against what the plan includes.
        {SUPPORT_URL && (
          <>
            {" "}
            If Betabook is useful to you, you can{" "}
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noreferrer"
              className="link inline underline focus-visible:status-focused"
            >
              help cover costs
            </a>
            .
          </>
        )}
      </p>
    </div>
  );
}

function TermsRouteView({ versioned }: { versioned: boolean }) {
  const { version } = useParams<{ version?: string }>();
  const matched = versioned
    ? TERMS_VERSIONS.find((entry) => entry.version === version)
    : TERMS_VERSIONS[0];

  if (!matched) {
    return (
      <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col gap-4`}>
        <PageTitle>Terms version not found</PageTitle>
        <p className="text-sm text-muted">
          Return to the <AppLink href="/terms">current Terms of Service</AppLink>.
        </p>
      </div>
    );
  }

  return (
    <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col gap-6`}>
      <TermsContent version={matched.version} />
      <nav aria-label="Published terms versions" className="flex flex-col gap-2 text-sm">
        <p>Published versions</p>
        {TERMS_VERSIONS.map((entry) => (
          <AppLink key={entry.version} href={termsHref(entry.version)}>
            {entry.label}
          </AppLink>
        ))}
      </nav>
    </div>
  );
}

function InfoRouteView({ kind }: { kind: InfoRouteKind }) {
  if (kind === "about") {
    return <AboutContent />;
  }
  if (kind === "terms") {
    return <TermsRouteView versioned={false} />;
  }
  if (kind === "terms-version") {
    return <TermsRouteView versioned />;
  }
  if (kind === "contact") {
    return (
      <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col gap-4`}>
        <PageTitle>Contact us</PageTitle>
        <p className="text-lg leading-relaxed text-pretty text-muted">
          Found a climb with the wrong grade, an area in the wrong place, or something that plainly
          doesn’t work? Say so here.
        </p>
        <p className="leading-relaxed text-pretty">
          You don’t need an account. Leave an email to get a reply, or file it on the{" "}
          <a
            href="https://github.com/betabook-ca/betabook/issues"
            target="_blank"
            rel="noreferrer"
            className="link inline underline focus-visible:status-focused"
          >
            issue tracker
          </a>
          .
        </p>
        <ContactForm />
      </div>
    );
  }
  if (kind === "kaya-import") {
    return <ImportLandingPage source="kaya" />;
  }
  if (kind === "sendage-import") {
    return <ImportLandingPage source="sendage" />;
  }
  if (kind === "mountain-project-import") {
    return <ImportLandingPage source="mountainProject" />;
  }
  if (kind === "costs") {
    return (
      <div className={`mx-auto flex w-full ${READING_MAX_WIDTH_CLASS} flex-col gap-6`}>
        <div className="flex flex-col gap-3">
          <PageTitle>Cost transparency</PageTitle>
          <p className="text-lg leading-relaxed text-pretty text-muted">
            Betabook has no ads or fees. Its code runs on Cloudflare Workers and its data lives in
            Cloudflare D1, a SQL database.
          </p>
        </div>
        <RunningCosts usage={null} supportUrl={SUPPORT_URL} />
      </div>
    );
  }

  return (
    <LandingPage>
      <LandingHero
        eyebrow="Betabook"
        title="A free climbing logbook"
        lead="Log bouldering, sport and trad sends, sessions and projects, and see how your grades change over time."
        actions={[
          { href: signUpUrl(), label: "Create a free account" },
          { href: "/", label: "Search climbs" },
        ]}
      />
      <LandingSection title="Features">
        <FeatureList
          features={[
            {
              title: "Sends",
              body: "The date, style, rating, grade feel and a note for each ascent.",
            },
            {
              title: "Journal",
              body: "Sessions, repeats and training, with tags and the friends you climbed with.",
            },
            {
              title: "Projects",
              body: "Climbs you’re still working on, with the notes from each session.",
            },
            {
              title: "Analytics",
              body: "Grade pyramid, progression, volume and a climbing calendar.",
            },
            {
              title: "Friends and feed",
              body: "A feed of what your friends climbed, and suggestions for climbers you may know.",
            },
            {
              title: "Crag database",
              body: "Areas, routes and boulder problems with grades and community ratings.",
            },
          ]}
        />
      </LandingSection>
      <LandingSection title="Progression and grade pyramid">
        <LogbookPreview />
      </LandingSection>
      <LandingSection title="Import from another logbook">
        <LandingLinks links={Object.values(IMPORT_PAGES)} />
      </LandingSection>
      <LandingSection title="Questions">
        <QuestionList
          questions={[
            { question: "Is Betabook free?", answer: "Yes. There are no subscriptions or ads." },
            {
              question: "Which kinds of climbing can I log?",
              answer: "Boulder problems, sport routes and trad routes.",
            },
            {
              question: "Can I keep my climbing private?",
              answer:
                "Yes. You can make your profile private and choose who reads your journal, send notes, trips, and lists.",
            },
          ]}
        />
      </LandingSection>
    </LandingPage>
  );
}

export default InfoRouteView;
