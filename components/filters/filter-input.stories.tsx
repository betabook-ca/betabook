import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { LocalFiltersDemo } from "@/stories/fixtures/filter-demo";

import { FilterInput } from "./filter-input";
const meta = { title: "Components/Filters/Text filter", component: FilterInput } satisfies Meta<
  typeof FilterInput
>;
export default meta;
export const FilterList: StoryObj = { render: () => <LocalFiltersDemo /> };
