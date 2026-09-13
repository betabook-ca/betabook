import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { CATALOG_FIXTURES } from "@/stories/fixtures/catalog-data";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { SearchResults } from "./search-results";
import type { SearchResult, SearchStatus } from "./search-types";

const meta = { title: "Components/Search/Results", component: SearchResults } satisfies Meta<
  typeof SearchResults
>;
export default meta;
type Story = StoryObj;
function Example({ status = "ready" }: { status?: SearchStatus }) {
  const [current, setCurrent] = useState(status);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  return (
    <StoryPage
      title="Search results"
      description="Navigation results show an arrow; selection results omit it."
    >
      <SearchResults
        sections={[
          {
            kind: "climb",
            items:
              current === "ready"
                ? CATALOG_FIXTURES.filter((item) => item.kind === "climb")
                    .slice(0, 3)
                    .map((item, index) => ({
                      ...item,
                      stats: {
                        avgRating: index === 2 ? null : 4.5 - index,
                        sendCount: [12, 1, 0][index],
                      },
                    }))
                : [],
            status: current,
          },
        ]}
        onSelect={setSelected}
        onRetry={() => setCurrent("ready")}
      />
      <output className="text-sm">
        {selected ? `Selected: ${selected.name}` : "Choose a result"}
      </output>
    </StoryPage>
  );
}
export const Results: Story = { render: () => <Example /> };
export const Loading: Story = { render: () => <Example status="loading" /> };
export const Retry: Story = { render: () => <Example status="error" /> };
