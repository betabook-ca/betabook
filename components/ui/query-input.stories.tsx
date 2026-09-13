import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { QueryInput } from "./query-input";
const meta = { title: "Components/Inputs/Query field", component: QueryInput } satisfies Meta<
  typeof QueryInput
>;
export default meta;
function Example() {
  const [value, setValue] = useState("");
  return (
    <StoryPage
      title="Shared query field"
      description="Search, filter, and sort boxes share responsive heights, including theme borders. Each consumer owns query or filter behavior."
    >
      <QueryInput
        label="Limited query"
        value={value}
        onChange={setValue}
        inputProps={{ maxLength: 12 }}
      />
      <output>{value.length} / 12 characters</output>
    </StoryPage>
  );
}
export const CharacterLimit: StoryObj = { render: () => <Example /> };
