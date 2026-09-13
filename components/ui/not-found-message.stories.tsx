import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { NotFoundMessage } from "./not-found-message";

const meta = {
  title: "Components/Feedback/Not found message",
  component: NotFoundMessage,
} satisfies Meta<typeof NotFoundMessage>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const NotFound: Story = {
  render: () => (
    <NotFoundMessage
      heading="Climb not found"
      message="This climb may have been moved or removed."
    />
  ),
};
export const LongHeading: Story = {
  render: () => (
    <NotFoundMessage
      heading="This climbing area could not be found"
      message="Search for a nearby area to keep exploring."
    />
  ),
};
