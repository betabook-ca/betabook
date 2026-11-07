import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";

import { LogEntryButton } from "@/components/journal";
import { climbListChoiceSamples } from "@/stories/fixtures/climb-lists";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AddToListButton } from "./add-to-list-button";

const meta = {
  title: "Components/Climb lists/Add to list button",
  component: AddToListButton,
  args: {
    climb: { id: 101, name: "Amarillo Sunset" },
    viewerId: "alex",
    fetcher: async () => climbListChoiceSamples,
  },
} satisfies Meta<typeof AddToListButton>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Beside Log in the climb header: an outline secondary action, so Log stays
 * the primary one. */
export const BesideLog: Story = {
  render: (args) => (
    <StoryPage title="Climb header actions">
      <div className="flex items-center gap-2">
        <LogEntryButton
          climb={{
            id: 101,
            areaId: 1,
            type: "sport",
            grade: 12,
            brokenOn: null,
            name: "Amarillo Sunset",
          }}
        />
        <AddToListButton {...args} />
      </div>
    </StoryPage>
  ),
};

/** A climber with dozens of lists: the dropdown searches them and scrolls,
 * so it doesn't grow with the count. Opens on load. */
export const ManyLists: Story = {
  args: {
    fetcher: async () => [
      ...climbListChoiceSamples,
      ...Array.from({ length: 40 }, (_, n) => ({
        id: 100 + n,
        title: `Project pile ${n + 1}`,
        climbCount: n,
        hasClimb: n % 7 === 0,
      })),
    ],
  },
  render: (args) => (
    <StoryPage title="Add to list with many lists">
      <div className="flex justify-end">
        <AddToListButton {...args} />
      </div>
    </StoryPage>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Add to list" }));
  },
};
