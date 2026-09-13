import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ActiveFilterSummary } from "./active-filter-summary";
const meta = {
  title: "Components/Filters/Active filters",
  component: ActiveFilterSummary,
} satisfies Meta<typeof ActiveFilterSummary>;
export default meta;
export const Removable: StoryObj = {
  render: function Render() {
    const [labels, setLabels] = useState([
      "Boulder",
      "Boulder grades: V3–V8",
      "Rating: 3–5 stars",
      "#trip",
    ]);
    return (
      <StoryPage
        title="Active filters"
        description="Visible even with the filter panel closed. Remove one tag or clear all filters."
      >
        <ActiveFilterSummary
          filters={labels.map((label) => ({
            id: label,
            label,
            ...(label === "Rating: 3–5 stars" ? { ratingRange: [3, 5] as [number, number] } : {}),
            onRemove: () => setLabels(labels.filter((l) => l !== label)),
          }))}
          onClear={() => setLabels([])}
        />
      </StoryPage>
    );
  },
};
