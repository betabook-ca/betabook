import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SectionHeading } from "@/components/ui/typography";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { TripDayOrderControl } from "./trip-day-order";

const HREFS = { oldest: "/users/sample/trips/2", newest: "/users/sample/trips/2?order=newest" };

const meta = {
  title: "Components/Trips/Trip day order",
  component: TripDayOrderControl,
  args: { order: { value: "oldest", hrefs: HREFS } },
  decorators: [
    (Story) => (
      <StoryPage title="Trip day order">
        <div className="flex items-center gap-1">
          <SectionHeading>Days</SectionHeading>
          <Story />
        </div>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof TripDayOrderControl>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Up arrow: oldest day first. The tooltip offers newest first. */
export const OldestFirst: Story = {};

/** Down arrow: newest day first. */
export const NewestFirst: Story = { args: { order: { value: "newest", hrefs: HREFS } } };
