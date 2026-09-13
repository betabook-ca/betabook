import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { hashtagActiveFilters } from "@/components/filters/active-filter-values";
import { FilterInput } from "@/components/filters/filter-input";
import { HashtagFilter } from "@/components/filters/hashtag-filter";
import { DEFAULT_DISCIPLINE_FILTER } from "@/lib/filters/discipline-filter";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { FilterToolbar } from "./filter-toolbar";

const meta = {
  title: "Components/Filters/Toolbar",
  component: FilterToolbar,
  parameters: {
    docs: {
      description: {
        component:
          "Expand filters uses the same outlined action style as dashboard customization. The expanded panel uses the same muted surface as summary cards in both themes.",
      },
    },
  },
} satisfies Meta<typeof FilterToolbar>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
function FiltersExample() {
  const [filter, setFilter] = useState(DEFAULT_DISCIPLINE_FILTER);
  const [query, setQuery] = useState("");
  return (
    <StoryPage title="Climb filter toolbar">
      <FilterToolbar
        value={filter}
        onChange={setFilter}
        onReset={() => {
          setFilter(DEFAULT_DISCIPLINE_FILTER);
          setQuery("");
        }}
        textFilter={<FilterInput label="Filter climbs" value={query} onChange={setQuery} />}
      />
    </StoryPage>
  );
}
export const Filters: Story = { render: () => <FiltersExample /> };

function HashtagFiltersExample() {
  const [filter, setFilter] = useState(DEFAULT_DISCIPLINE_FILTER);
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  return (
    <StoryPage
      title="Tags toolbar"
      description="Selected tags appear below the field and in the persistent active-filter summary."
    >
      <FilterToolbar
        value={filter}
        onChange={setFilter}
        onReset={() => {
          setFilter(DEFAULT_DISCIPLINE_FILTER);
          setTags([]);
          setQuery("");
        }}
        textFilter={<FilterInput label="Filter climbs" value={query} onChange={setQuery} />}
        activeFilters={hashtagActiveFilters(tags, setTags)}
        extraFilters={
          <HashtagFilter
            inlineLabel
            value={tags}
            onChange={setTags}
            tags={["power", "strength", "trip"]}
          />
        }
      />
    </StoryPage>
  );
}
export const Hashtags: Story = { name: "Tags", render: () => <HashtagFiltersExample /> };
