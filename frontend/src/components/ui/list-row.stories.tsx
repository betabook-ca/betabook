import type { Meta, StoryObj } from "@storybook/react-vite";

import { Grade } from "@/components/climbing/grade";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ListRow } from "./list-row";
const meta = {
  title: "Components/Data display/List row",
  component: ListRow,
  args: {
    title: "Cedar Arete",
    subtitle: "North Woods",
    trailing: <Grade>V4</Grade>,
    comment: "A short note.",
    href: "#sample-climb",
  },
  decorators: [
    (Story) => (
      <StoryPage title="List row">
        <Story />
        <p id="sample-climb">Local climb destination</p>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ListRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const LongContent: Story = {
  args: {
    wrapTitle: true,
    title: "A very long route name that wraps without hiding the trailing grade",
    subtitle: "A long area name at the far end of the valley",
    trailing: <Grade>5.11a</Grade>,
  },
};
export const AuthoredUpdate: Story = {
  args: {
    title: "Alex Rivera with a long display name",
    wrapTitle: true,
    subtitle: undefined,
    trailing: undefined,
    meta: "Session",
    comment: "Found a comfortable high foot after working the opening moves.",
  },
};
/** No side padding and tighter rows, for a list inside an already padded
 * section such as the goals list. */
export const Flush: Story = {
  args: { density: "flush", comment: undefined },
};
