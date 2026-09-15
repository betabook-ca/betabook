import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { JournalEntry } from "@/db/queries";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { JournalEntryRow } from "./journal-entry-row";

const entry: JournalEntry = {
  id: 1,
  climbId: 2,
  kind: "session",
  sent: false,
  entryDate: "2026-09-04",
  body: "Found a comfortable high foot after working the opening moves. Next time I want to link the middle section with a calmer approach and keep enough energy for the final moves. The last attempt felt much more controlled than the first.",
  tags: ["footwork", "project"],
  climbName: "Cedar Arete",
  climbType: "boulder",
  climbGrade: 5,
  areaId: 3,
  areaName: "Granite Canyon",
  isAscent: false,
  isSendComment: false,
};
const meta = {
  title: "Components/Journal/Entry row",
  component: JournalEntryRow,
  args: {
    entry,
    isOwner: true,
    userId: "sample",
    filter: DEFAULT_JOURNAL_FILTER,
    areaBreadcrumbs: {},
  },
  decorators: [
    (Story) => (
      <StoryPage title="Journal entries">
        <div data-journal-example>
          <Story />
        </div>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof JournalEntryRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Session: Story = {};
export const Sent: Story = {
  args: {
    entry: {
      ...entry,
      isAscent: true,
      sent: true,
      body: "A calm finish after a few good attempts.",
    },
  },
};
export const Training: Story = {
  args: {
    entry: {
      ...entry,
      kind: "training",
      climbId: null,
      climbName: null,
      climbType: null,
      climbGrade: null,
      areaId: null,
      areaName: null,
    },
  },
};
export const LongName: Story = {
  args: {
    entry: {
      ...entry,
      climbName: "The Very Long Traverse Around the Far Side of the Boulder",
      tags: [],
    },
  },
};
export const Visitor: Story = { args: { isOwner: false } };
