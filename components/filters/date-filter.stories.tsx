import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import type { DateFilterValue } from "@/lib/filters/date-filter";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { DateFilter } from "./date-filter";

const meta = { title: "Components/Filters/Date filter", component: DateFilter } satisfies Meta<
  typeof DateFilter
>;
export default meta;
type Story = StoryObj;
const EMPTY_DATES: DateFilterValue = {};
function Example({ initial = EMPTY_DATES }: { initial?: DateFilterValue }) {
  const [value, setValue] = useState(initial);
  return (
    <StoryPage title="Filter sends and sessions by date">
      <DateFilter value={value} onChange={setValue} referenceDate="2026-09-07" />
      <output aria-label="Selected dates">{JSON.stringify(value)}</output>
    </StoryPage>
  );
}
export const Any: Story = { name: "All time", render: () => <Example /> };
export const SpecificDay: Story = { render: () => <Example initial={{ date: "2025-06-01" }} /> };
export const DateRange: Story = {
  render: () => <Example initial={{ dateFrom: "2025-06-01", dateTo: "2025-08-31" }} />,
};
export const ThisMonth: Story = {
  render: () => (
    <Example initial={{ dateFrom: "2026-09-01", dateTo: "2026-09-30", datePreset: "this-month" }} />
  ),
};
