import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { QueryInput } from "@/components/ui/query-input";
import { LocalFiltersDemo } from "@/stories/fixtures/filter-demo";

// A filter toolbar's text box is a plain QueryInput at its default width. It
// narrows the list already on screen; pair it with `textActiveFilters` so the
// "Text:" chip reads the same everywhere.
const meta = { title: "Components/Filters/Text filter", component: QueryInput } satisfies Meta<
  typeof QueryInput
>;
export default meta;
export const FilterList: StoryObj = { render: () => <LocalFiltersDemo /> };
