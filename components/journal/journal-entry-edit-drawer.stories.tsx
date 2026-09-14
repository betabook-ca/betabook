import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { JournalEntry } from "@/db/queries";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { JournalEntryEditDrawer } from "./journal-entry-edit-drawer";
const entry: JournalEntry = {
  id: -1,
  kind: "session",
  climbId: -1,
  sent: false,
  entryDate: "2026-09-11",
  body: "Worked on the opening moves.",
  tags: [],
  companions: [],
  climbName: "Cedar Arete",
  climbType: "boulder",
  climbGrade: 5,
  areaId: -1,
  areaName: "Cedar Grove",
  isAscent: false,
  isSendComment: false,
};
const meta = {
  title: "Components/Journal/Edit popup",
  component: JournalEntryEditDrawer,
  args: { entry },
  render: function Example(args) {
    const state = useOverlayState({ defaultOpen: true });
    return (
      <StoryPage title={state.isOpen ? undefined : "Journal"}>
        <Button onPress={state.open}>Edit entry</Button>
        <JournalEntryEditDrawer {...args} state={state} />
      </StoryPage>
    );
  },
} satisfies Meta<typeof JournalEntryEditDrawer>;
export default meta;
type Story = StoryObj;
export const Session: Story = {};
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
      body: "Strength and mobility.",
    },
  },
};
