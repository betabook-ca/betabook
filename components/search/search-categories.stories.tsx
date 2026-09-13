import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { SearchCategories } from "./search-categories";
import type { SearchCategory } from "./search-types";

const meta = { title: "Components/Search/Categories", component: SearchCategories } satisfies Meta<
  typeof SearchCategories
>;
export default meta;
type Story = StoryObj;
function Example() {
  const [value, setValue] = useState<SearchCategory>("all");
  return (
    <StoryPage title="Search categories">
      <SearchCategories value={value} onChange={setValue} />
    </StoryPage>
  );
}
export const Categories: Story = { render: () => <Example /> };
