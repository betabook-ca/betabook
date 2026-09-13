import type { Metadata } from "next";

import {
  FeatureList,
  LandingHero,
  LandingLinks,
  LandingPage,
  LandingSection,
  QuestionList,
} from "@/components/landing-page";
import { LogbookPreview } from "@/components/logbook-preview";
import { AppLink } from "@/components/ui/app-link";
import { IMPORT_PAGES, LOGBOOK_PAGE } from "@/lib/landing-pages";
import { pageMetadata } from "@/lib/seo";
import { signUpUrl } from "@/lib/sign-in-redirect";

export const metadata: Metadata = pageMetadata({
  title: "Free climbing logbook",
  description:
    "A free climbing logbook for bouldering, sport and trad. Log sends and sessions, see your progression, and import from KAYA, Sendage or Mountain Project.",
  path: LOGBOOK_PAGE.path,
});

export default function ClimbingLogbookPage() {
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
              body: "Sessions, repeats and training, with tags and the friends you climbed with. One audience setting covers your whole journal.",
            },
            {
              title: "Projects",
              body: "Climbs you’re still working on, with the notes from each session.",
            },
            {
              title: "Analytics",
              body: "Grade pyramid, progression, volume and a climbing calendar, for all time or chosen years.",
            },
            {
              title: "Friends and feed",
              body: "A feed of what your friends climbed, and suggestions for climbers you may know.",
            },
            {
              title: "Crag database",
              body: "Areas, routes and boulder problems with grades and community ratings. Members can add missing climbs and descriptions.",
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
            {
              question: "Is Betabook free?",
              answer: "Yes. There are no subscriptions or ads.",
            },
            {
              question: "Which kinds of climbing can I log?",
              answer: "Boulder problems, sport routes and trad routes.",
            },
            {
              question: "Can I keep my climbing private?",
              answer:
                "Yes. You can make your profile private and choose who reads your journal and send notes.",
            },
            {
              question: "Does it work on my phone?",
              answer: "Yes, in your phone’s browser. You can also add it to your home screen.",
            },
            {
              question: "Can I export my sends?",
              answer: "Yes, as a CSV file from your account.",
            },
            {
              question: "Where do I report a wrong grade or a bug?",
              answer: (
                <>
                  Use the{" "}
                  <AppLink href="/contact" className="inline underline">
                    contact form
                  </AppLink>
                  , or open an issue on{" "}
                  <a
                    href="https://github.com/betabook-ca/betabook/issues"
                    target="_blank"
                    rel="noreferrer"
                    className="link inline underline focus-visible:status-focused"
                  >
                    GitHub
                  </a>
                  .
                </>
              ),
            },
          ]}
        />
      </LandingSection>
    </LandingPage>
  );
}
