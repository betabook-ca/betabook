import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { IMPORT_PAGES, LOGBOOK_PAGE } from "@/lib/landing-pages";
import { StoryPage } from "@/stories/fixtures/story-layout";

import {
  FeatureList,
  LandingHero,
  LandingLinks,
  LandingPage,
  LandingSection,
  QuestionList,
  StepList,
} from "./landing-page";

const meta = {
  title: "Components/Landing/Sections",
  component: LandingHero,
  args: {
    eyebrow: "Betabook",
    title: "A free climbing logbook",
    lead: "Log bouldering, sport and trad sends, sessions and projects, and see how your grades change over time.",
    actions: [
      { href: "/sign-up", label: "Create a free account" },
      { href: "/", label: "Search climbs" },
    ],
  },
} satisfies Meta<typeof LandingHero>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Hero: Story = {};

export const Home: Story = {
  args: {
    eyebrow: undefined,
    title: "A free climbing logbook and crag database",
    lead: "Log bouldering, sport and trad sends and sessions, and search routes and problems below.",
    actions: [
      { href: "/sign-up", label: "Create a free account" },
      { href: "/climbing-logbook", label: "How Betabook works" },
    ],
  },
};

export const Sections: Story = {
  render: () => (
    <StoryPage title="Landing page sections">
      <LandingPage>
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
            ]}
          />
        </LandingSection>
        <LandingSection title="Steps">
          <StepList
            steps={[
              "Create a Betabook account, or sign in.",
              "Open Import sends from your account and choose KAYA.",
              "Review the matches, then import. Nothing is saved until you finish.",
            ]}
          />
        </LandingSection>
        <LandingSection title="Questions">
          <QuestionList
            questions={[
              {
                question: "Does my KAYA profile need to be public?",
                answer: "For a username import, yes.",
              },
              { question: "How large can the file be?", answer: "Up to 10 MB or 50,000 rows." },
            ]}
          />
        </LandingSection>
        <LandingSection title="Related">
          <LandingLinks links={[...Object.values(IMPORT_PAGES), LOGBOOK_PAGE]} />
        </LandingSection>
      </LandingPage>
    </StoryPage>
  ),
};
