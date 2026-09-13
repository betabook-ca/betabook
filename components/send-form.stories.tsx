import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { SendForm } from "./send-form";

const meta = {
  title: "Components/Sends/Edit send and journal",
  component: SendForm,
  decorators: [
    (Story) => (
      <StoryPage
        title="Edit send and journal"
        description="The same editor opens from Sends and the original journal ascent. Notes, date, opinion, tags and friends save together."
      >
        <Story />
      </StoryPage>
    ),
  ],
  args: {
    climb: { id: -1, areaId: -1, type: "boulder", grade: 5 },
    existingSend: {
      id: -1,
      ascentStyle: "flash",
      dateSent: "2026-09-01",
      comment: "Kept the high foot through the crux.",
      rating: 4,
      suggestedGrade: 5,
      gradeFeel: "solid",
    },
    existingEntry: {
      id: -1,
      tags: ["footwork", "outdoors"],
      companions: [{ id: "sample-sam", name: "Sam Rivera", isSelf: false }],
    },
    companionFetcher: async () => [],
    onSave: async () => ({ ok: true, value: undefined }),
  },
} satisfies Meta<typeof SendForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const LinkedAscent: Story = {};
export const Undated: Story = {
  args: { existingSend: { ...meta.args.existingSend, dateSent: null }, existingEntry: null },
};
