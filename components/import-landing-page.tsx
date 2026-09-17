import {
  LandingHero,
  LandingLinks,
  LandingPage,
  LandingSection,
  QuestionList,
  StepList,
  type LandingQuestion,
} from "@/components/landing-page";
import { IMPORT_PAGES, LOGBOOK_PAGE, type ImportPageSource } from "@/lib/landing-pages";
import { signUpUrl } from "@/lib/sign-in-redirect";
import { SUPPORT_EMAIL } from "@/lib/support";

const ACCOUNT_IMPORT_PATH = "/account/import";

const ACCOUNT_STEP = "Create a Betabook account, or sign in.";
const MATCH_STEP =
  "Review how each ascent matched a Betabook climb. Pick between close matches, search under another spelling, or skip the row. Ascents on a climb that has since broken import only when dated before the break.";
const FINISH_STEP =
  "Choose whether to skip or overwrite climbs you’ve already logged, then import. Nothing is saved until you finish.";
const CSV_ANSWER =
  "In Import sends, choose CSV file and upload the export. Betabook recognizes the format and maps the columns.";

const COPY: Record<
  ImportPageSource,
  { title: string; lead: string; steps: string[]; questions: LandingQuestion[] }
> = {
  kaya: {
    title: "Import your KAYA logbook",
    lead: "Import the outdoor boulders and routes from your KAYA profile, or upload KAYA’s CSV export.",
    steps: [
      ACCOUNT_STEP,
      "Open Import sends from your account and choose KAYA.",
      "Enter your KAYA username or profile link. Betabook loads the outdoor boulders and routes on that profile.",
      MATCH_STEP,
      FINISH_STEP,
    ],
    questions: [
      {
        question: "Does my KAYA profile need to be public?",
        answer:
          "For a username import, yes. Betabook reads your public profile and never asks for your KAYA password. For a private profile, upload KAYA’s CSV export.",
      },
      {
        question: "How do I import KAYA’s CSV export?",
        answer: `Export your logbook from KAYA as a CSV file. ${CSV_ANSWER}`,
      },
      {
        question: "Are flashes and onsights kept?",
        answer:
          "Only from the CSV export. KAYA profiles don’t show ascent style, so a username import saves every send as a redpoint.",
      },
      {
        question: "Are gym climbs included?",
        answer: "No. The username import loads only outdoor boulders and routes.",
      },
      {
        question: "What if a climb name exists in more than one place?",
        answer:
          "Betabook uses KAYA’s location details to pick the right climb, and you can choose between close matches before importing.",
      },
      {
        question: "Does Betabook keep my KAYA username?",
        answer: "No. It’s used for the import and not saved.",
      },
    ],
  },
  sendage: {
    title: "Import your Sendage sends",
    lead: "Import the sends from your public Sendage profile without a Sendage login, or upload Sendage’s CSV export.",
    steps: [
      ACCOUNT_STEP,
      "Open Import sends from your account and choose Sendage.",
      "Enter your Sendage username or sendage.com/user profile link.",
      MATCH_STEP,
      FINISH_STEP,
    ],
    questions: [
      {
        question: "Does my Sendage profile need to be public?",
        answer: "For a username import, yes. For a private profile, upload Sendage’s CSV export.",
      },
      {
        question: "How do I import Sendage’s CSV export?",
        answer: `Export your sends from Sendage as a CSV file. ${CSV_ANSWER}`,
      },
      {
        question: "Which Sendage sends are imported?",
        answer:
          "Onsights, flashes and redpoints. Projects and repeats are skipped. Boulder onsights are saved as flashes, because Betabook logs boulders as flashes or redpoints.",
      },
      {
        question: "Are Sendage grades converted?",
        answer:
          "Yes. Sendage grade IDs become V and YDS grades, and an unknown grade stops the import.",
      },
      {
        question: "Why did fewer sends load than my profile shows?",
        answer: `Sendage’s profile count can include sends that aren’t in its public activity feed. Betabook warns when fewer sends load. Upload Sendage’s CSV export instead, or email ${SUPPORT_EMAIL}.`,
      },
      {
        question: "Does Betabook keep my Sendage username?",
        answer: "No. It’s used for the import and not saved.",
      },
    ],
  },
  mountainProject: {
    title: "Import your Mountain Project ticks",
    lead: "Import the ticks from your Mountain Project profile, or upload their CSV export.",
    steps: [
      ACCOUNT_STEP,
      "Open Import sends from your account and choose Mountain Project.",
      "Paste your profile link, or the user ID inside it. Betabook downloads the same tick export the site gives you.",
      MATCH_STEP,
      FINISH_STEP,
    ],
    questions: [
      {
        question: "Where do I find my user ID?",
        answer:
          "Open your Mountain Project profile and copy the address. It looks like mountainproject.com/user/123456789/your-name, and 123456789 is your ID. Either the whole link or the number works.",
      },
      {
        question: "Do I need a Mountain Project login?",
        answer:
          "No. Betabook downloads the tick export their site publishes for your profile, and never asks for your Mountain Project password.",
      },
      {
        question: "Which ticks are imported?",
        answer:
          "The ones whose style maps to a Betabook ascent. Sends, flashes, onsights and redpoints map on their own; attempts, top ropes and follows are listed as skipped until you map them yourself.",
      },
      {
        question: "How do I import Mountain Project’s CSV export?",
        answer: `Export your ticks from Mountain Project as a CSV file. ${CSV_ANSWER}`,
      },
      {
        question: "Which columns does Betabook read?",
        answer:
          "Rating is the route’s grade, Your Rating is your suggested grade and Your Stars is your rating. Location is the area path used to find the climb. The ascent style comes from Lead Style, or from Style when Lead Style is blank.",
      },
      {
        question: "Mountain Project stars stop at 4. What happens to them?",
        answer:
          "They are spread across Betabook's five, so a 4-star classic imports as 5 and a 3-star as 4. Half stars round to a whole star. Every star value is listed in the import steps, so you can change any of them before saving.",
      },
      {
        question: "Will my ticks find the right climbs?",
        answer:
          "Betabook matches on the climb's name and uses your tick's location path to tell same-named climbs apart. The two sites organize areas differently, so the path is only a hint. A name Betabook doesn't hold is shown for you to search or skip — it is never guessed at.",
      },
      {
        question: "What about grades like 5.10c PG13?",
        answer: "Protection ratings such as PG13, R and X are removed from the grade.",
      },
      {
        question: "How large can a tick list be?",
        answer: "Up to 10 MB or 50,000 ticks, whether it is downloaded or uploaded.",
      },
      {
        question: "Can I change the column mapping?",
        answer: "Yes, from the import steps.",
      },
      {
        question: "Does Betabook keep my Mountain Project user ID?",
        answer: "No. It’s used for the import and not saved.",
      },
    ],
  },
};

export function ImportLandingPage({ source }: { source: ImportPageSource }) {
  const copy = COPY[source];
  const others = (Object.keys(IMPORT_PAGES) as ImportPageSource[])
    .filter((key) => key !== source)
    .map((key) => IMPORT_PAGES[key]);
  return (
    <LandingPage>
      <LandingHero
        eyebrow={IMPORT_PAGES[source].label}
        title={copy.title}
        lead={copy.lead}
        actions={[
          { href: signUpUrl(ACCOUNT_IMPORT_PATH), label: "Create a free account" },
          { href: ACCOUNT_IMPORT_PATH, label: "Import sends" },
        ]}
      />
      <LandingSection title="Steps">
        <StepList steps={copy.steps} />
      </LandingSection>
      <LandingSection title="Questions">
        <QuestionList questions={copy.questions} />
      </LandingSection>
      <LandingSection title="Related">
        <LandingLinks links={[...others, LOGBOOK_PAGE]} />
      </LandingSection>
    </LandingPage>
  );
}
