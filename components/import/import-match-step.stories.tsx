import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { mocked } from "storybook/test";

import { cardClass } from "@/components/ui/card";
import type { ClimbCandidate } from "@/db/queries";
import {
  foldClimbName,
  matchRows,
  mergeCandidates,
  resolveRows,
  summarizeResolved,
  type ManualChoice,
  type PreferredArea,
} from "@/lib/import-matching";
import { fetchAreaSuggestions } from "@/lib/search-suggestions";
import type { NormalizedImportRow } from "@/lib/sends-import";
import { searchAreaFetcher } from "@/stories/fixtures/app-search-demo";
import { StoryPage } from "@/stories/fixtures/story-layout";

import {
  defaultFilter,
  ImportMatchStep,
  type Filter,
  type LookupStatus,
} from "./import-match-step";
import { WizardSteps } from "./wizard-steps";

const meta = {
  title: "Components/Import/Import match",
  component: ImportMatchStep,
  decorators: [
    (Story) => (
      <StoryPage title="Import sends">
        <div className={`flex flex-col gap-6 ${cardClass("fluid")}`}>
          <WizardSteps step="match" onJump={null} />
          <Story />
        </div>
      </StoryPage>
    ),
  ],
  beforeEach: () => {
    mocked(fetchAreaSuggestions).mockImplementation(searchAreaFetcher);
    return () => mocked(fetchAreaSuggestions).mockReset();
  },
} satisfies Meta<typeof ImportMatchStep>;
export default meta;
// The example owns the wizard's state, so picks, skips and filters re-resolve the rows.
type Story = StoryObj;

const BISHOP = { id: 1, name: "Bishop" };
const SQUAMISH = { id: 7, name: "Squamish" };

function candidate(
  fields: Pick<ClimbCandidate, "id" | "name" | "areaId" | "areaName"> & Partial<ClimbCandidate>,
): ClimbCandidate {
  return {
    key: foldClimbName(fields.name),
    type: "boulder",
    grade: 4,
    sendCount: 20,
    brokenOn: null,
    ancestors: [BISHOP],
    total: 1,
    ...fields,
  };
}

/** What the catalog answered for the file's names, one case per resolution. */
const CANDIDATES: ClimbCandidate[] = [
  // One climb with this name: matched outright.
  candidate({
    id: 11,
    name: "Cedar Arete",
    areaId: 2,
    areaName: "Buttermilks",
    grade: 5,
    sendCount: 37,
  }),
  candidate({
    id: 12,
    name: "Warm-up Arete",
    areaId: 2,
    areaName: "Buttermilks",
    grade: 2,
    sendCount: 64,
  }),
  // Two share the name, both in the chosen area: needs a pick.
  candidate({
    id: 21,
    name: "The Wave",
    areaId: 3,
    areaName: "Happy Boulders",
    sendCount: 12,
    total: 2,
  }),
  candidate({
    id: 22,
    name: "The Wave",
    areaId: 4,
    areaName: "Sad Boulders",
    sendCount: 5,
    total: 2,
  }),
  // Two share the name; "Your areas" settles it, which is what Check reviews.
  candidate({
    id: 31,
    name: "Moon Slab",
    areaId: 2,
    areaName: "Buttermilks",
    grade: 8,
    sendCount: 9,
    total: 2,
  }),
  candidate({
    id: 32,
    name: "Moon Slab",
    areaId: 8,
    areaName: "Grand Wall Boulders",
    ancestors: [SQUAMISH],
    grade: 8,
    sendCount: 4,
    total: 2,
  }),
  // Broke before the row's date, so the row can't import.
  candidate({
    id: 41,
    name: "Old Flake",
    areaId: 3,
    areaName: "Happy Boulders",
    grade: 3,
    brokenOn: "2026-03-05",
    sendCount: 15,
  }),
];
const INDEX = mergeCandidates(new Map(), CANDIDATES);

function row(
  rowIndex: number,
  climbName: string,
  fields: Partial<NormalizedImportRow> = {},
): NormalizedImportRow {
  return {
    rowIndex,
    climbName,
    areaName: null,
    areaHints: [],
    climbTypeHint: null,
    ascentStyle: "redpoint",
    dateSent: "2026-03-14",
    rating: null,
    comment: null,
    gradeText: null,
    blankGradeMeans: "posted-grade",
    postedGradeText: null,
    gradeFeel: "solid",
    raw: {},
    ...fields,
  };
}

/** A Bishop trip's log, with a name the catalog doesn't know and a repeat. */
const ROWS: NormalizedImportRow[] = [
  row(0, "Cedar Arete", { gradeText: "V5", areaHints: ["Buttermilks", "Bishop"] }),
  row(1, "The Wave", { gradeText: "V4", dateSent: "2026-03-15" }),
  row(2, "Moon Slab", { gradeText: "V8", rating: 4, dateSent: "2026-03-16" }),
  row(3, "Old Flake", { gradeText: "V3", dateSent: "2026-03-16" }),
  row(4, "Ghost Line", { gradeText: "V6", dateSent: "2026-03-17" }),
  row(5, "Cedar Arete", { gradeText: "V5", ascentStyle: "flash", dateSent: "2026-03-18" }),
];
const MATCHED_ROWS: NormalizedImportRow[] = [
  row(0, "Cedar Arete", { gradeText: "V5" }),
  row(1, "Warm-up Arete", { gradeText: "V2", ascentStyle: "flash" }),
];
const DONE: LookupStatus = { phase: "done" };
const NO_CHOICES: [number, ManualChoice][] = [];

function Example({
  rows = ROWS,
  lookup: initialLookup = DONE,
  filter: initialFilter = null,
  manual: initialManual = NO_CHOICES,
}: {
  rows?: NormalizedImportRow[];
  lookup?: LookupStatus;
  filter?: Filter | null;
  manual?: [number, ManualChoice][];
}) {
  const [lookup, setLookup] = useState(initialLookup);
  const [preferredAreas, setPreferredAreas] = useState<PreferredArea[]>([BISHOP]);
  const [manual, setManual] = useState(() => new Map(initialManual));
  const [filter, setFilter] = useState(initialFilter);
  const resolved =
    lookup.phase === "done"
      ? resolveRows(rows, matchRows(rows, INDEX, { gradeScale: "native", preferredAreas }), manual)
      : null;
  const summary = resolved && summarizeResolved(resolved);

  function choose(next: Map<number, ManualChoice>, rowIndex: number, choice: ManualChoice | null) {
    if (choice) next.set(rowIndex, choice);
    else next.delete(rowIndex);
  }

  return (
    <ImportMatchStep
      resolved={resolved}
      summary={summary}
      lookup={lookup}
      onRetryLookup={() => setLookup(DONE)}
      preferredAreas={preferredAreas}
      onPreferredAreasChange={setPreferredAreas}
      filter={filter ?? (summary ? defaultFilter(summary) : null)}
      onFilterChange={setFilter}
      onChoose={(rowIndex, choice) =>
        setManual((prev) => {
          const next = new Map(prev);
          choose(next, rowIndex, choice);
          return next;
        })
      }
      onChooseMany={(choices) =>
        setManual((prev) => {
          const next = new Map(prev);
          for (const { rowIndex, choice } of choices) choose(next, rowIndex, choice);
          return next;
        })
      }
    />
  );
}

/** The lookup in progress: the list appears only once every name has been
 * asked about. */
export const Loading: Story = {
  render: () => <Example lookup={{ phase: "loading", done: 12, total: 48 }} />,
};

/** The lookup failed: nothing to match yet, and Try again asks once more. */
export const Failed: Story = {
  render: () => <Example lookup={{ phase: "failed", error: "the request timed out" }} />,
};

/** The bucket the step opens on when it has work in it: a tie to break and a
 * name the catalog doesn't know. */
export const NeedsAttention: Story = { render: () => <Example filter="attention" /> };

/** Matched by a soft signal — here "Your areas" — so the row says why and
 * offers the alternatives behind Change. */
export const Review: Story = { render: () => <Example filter="review" /> };

/** Terminal: the climb broke before the ascent's date, so nothing picked
 * here can make the row import. */
export const Broken: Story = { render: () => <Example filter="broken" /> };

/** Every row at once, after a pick and a skip. The repeat warns that only
 * one Cedar Arete imports. */
export const AllRows: Story = {
  render: () => (
    <Example
      filter="all"
      manual={[
        [1, { kind: "pick", climb: CANDIDATES[2] }],
        [4, { kind: "skip" }],
      ]}
    />
  ),
};

/** A clean file: nothing needs attention, so the step opens on all rows. */
export const AllMatched: Story = { render: () => <Example rows={MATCHED_ROWS} /> };
