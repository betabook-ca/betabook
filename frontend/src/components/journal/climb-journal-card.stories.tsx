import type { Meta, StoryObj } from "@storybook/react-vite";

import type { JournalEntry } from "@/lib/logbook-types";
import { CLIMB_JOURNAL_ENTRY_LIMIT } from "@/lib/page-sizes";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbJournalCard } from "./climb-journal-card";

const entry = (
  id: number,
  entryDate: string,
  body: string | null,
  outcome: Partial<JournalEntry> = {},
): JournalEntry => ({
  reportedGrade: null,
  videos: null,
  companions: [],
  id,
  climbId: 2,
  kind: "session",
  sent: false,
  entryDate,
  body,
  tags: [],
  climbName: "Cedar Arete",
  climbType: "boulder",
  climbGrade: 4,
  climbBrokenOn: null,
  areaId: 3,
  areaName: "Granite Canyon",
  isAscent: false,
  isSendComment: false,
  ...outcome,
});

const sessions = [
  entry(4, "2026-09-12", "Warm-up lap before the project.", { sent: true }),
  entry(3, "2026-09-04", "Stuck the move I had been falling on. Shaky to the top.", {
    sent: true,
    isAscent: true,
  }),
  entry(2, "2026-08-30", "Fell at the lip twice. Feet keep cutting."),
];

const meta = {
  title: "Components/Journal/Climb journal card",
  component: ClimbJournalCard,
  args: { userId: "sample", climbId: 2, entries: sessions },
  decorators: [
    (Story) => (
      <StoryPage title="Your journal on a climb">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ClimbJournalCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Each entry keeps a visible edit button, since journal rows elsewhere open
 * the same menu only with a long press on touch screens. */
export const Sessions: Story = {};
export const MoreThanShown: Story = {
  args: {
    entries: Array.from({ length: CLIMB_JOURNAL_ENTRY_LIMIT }, (_, index) =>
      entry(index + 1, `2026-08-${String(28 - index).padStart(2, "0")}`, "Another session."),
    ),
  },
};
export const Empty: Story = { args: { entries: [] } };
