import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { formatAnalyticsYears } from "@/lib/analytics-years";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AnalyticsYearFilter } from "./analytics-year-filter";

const meta = {
  title: "Components/Inputs/Analytics years",
  component: AnalyticsYearFilter,
  parameters: {
    docs: {
      description: {
        component:
          "A checklist menu of years named by the current selection. All years clears the year filter; the selection filters every dashboard statistic and chart.",
      },
    },
  },
} satisfies Meta<typeof AnalyticsYearFilter>;
export default meta;
type Story = StoryObj;
const INITIAL_YEARS = [2020, 2021, 2022, 2023];
function YearExample({ initial = INITIAL_YEARS }: { initial?: number[] }) {
  const [selected, setSelected] = useState<number[]>(initial);
  return (
    <StoryPage
      title="Analytics years"
      description="Choose any combination of years. All resets the selection."
    >
      <AnalyticsYearFilter
        years={Array.from({ length: 10 }, (_, index) => 2017 + index)}
        selected={selected}
        onChange={setSelected}
      />
      <p role="status" className="text-sm text-muted">
        {formatAnalyticsYears(selected)}
      </p>
    </StoryPage>
  );
}
export const Selection: Story = { render: () => <YearExample /> };

export const AllYears: Story = { render: () => <YearExample initial={[]} /> };
export const SingleYear: Story = { render: () => <YearExample initial={[2026]} /> };
