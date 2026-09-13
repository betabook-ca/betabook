import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import type { AreaSelection } from "@/lib/area-selection";
import { searchAreaFetcher } from "@/stories/fixtures/app-search-demo";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AreaLookup } from "./area-lookup";
const meta = { title: "Components/Search/Area lookup", component: AreaLookup } satisfies Meta<
  typeof AreaLookup
>;
export default meta;
type Story = StoryObj;
function Example() {
  const [area, setArea] = useState<AreaSelection | null>(null);
  return (
    <StoryPage title="Select an area">
      <AreaLookup label="Area" value={area} onChange={setArea} fetcher={searchAreaFetcher} />
      <output aria-label="Selected area identity">{area?.id ?? "None"}</output>
    </StoryPage>
  );
}
export const Selection: Story = { render: () => <Example /> };
