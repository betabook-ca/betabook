import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { DISCIPLINE_HUE } from "@/components/ui/discipline-chip";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbingCalendar } from "./climbing-calendar";

const meta = {
  title: "Components/Charts/Climbing calendar",
  component: ClimbingCalendar,
} satisfies Meta<typeof ClimbingCalendar>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const Calendar: Story = {
  render: () => (
    <StoryPage
      title="Climbing calendar"
      description="Calendars fit the card on every screen, with hover, tap, and arrow-key details."
    >
      <ClimbingCalendar
        year={2026}
        countsByDay={{ "2026-01-04": 1, "2026-03-20": 2, "2026-06-14": 5, "2026-09-01": 3 }}
        hue={DISCIPLINE_HUE.boulder}
        unit="session"
      />
      <Example title="Empty year">
        <ClimbingCalendar year={2026} countsByDay={{}} hue={DISCIPLINE_HUE.sport} unit="send" />
      </Example>
    </StoryPage>
  ),
};
