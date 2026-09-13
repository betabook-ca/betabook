import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ImportDateWarning } from "./import-date-warning";

const meta = {
  title: "Components/Import/Repeated dates",
  component: ImportDateWarning,
  decorators: [
    (Story) => (
      <StoryPage title="Review import dates">
        <Story />
      </StoryPage>
    ),
  ],
  args: {
    clusters: [{ date: "2025-09-03", count: 49, datedCount: 60 }],
    undatedDates: new Set<string>(),
    onChange: () => {},
  },
  render: function Render(args) {
    const [dates, setDates] = useState(args.undatedDates);
    return <ImportDateWarning {...args} undatedDates={dates} onChange={setDates} />;
  },
} satisfies Meta<typeof ImportDateWarning>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ExampleProfile: Story = {};
export const ImportWithoutDates: Story = { args: { undatedDates: new Set(["2025-09-03"]) } };
export const MultipleDates: Story = {
  args: {
    clusters: [
      { date: "2025-09-03", count: 49, datedCount: 80 },
      { date: "2026-03-18", count: 25, datedCount: 80 },
    ],
  },
};
