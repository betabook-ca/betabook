import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { RatingStars } from "./rating-stars";

const meta = {
  title: "Components/Data display/Rating stars",
  component: RatingStars,
} satisfies Meta<typeof RatingStars>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const Ratings: Story = {
  render: () => (
    <StoryPage
      title="Rating states"
      description="Numbers precede the shared star icon in results and active rating ranges."
    >
      {[null, 0, 1, 2.5, 4].map((value) => (
        <Example key={String(value)} title={value === null ? "Unrated" : `${value} stars`}>
          <RatingStars rating={value} precision="decimal" />
        </Example>
      ))}
    </StoryPage>
  ),
};
