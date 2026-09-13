import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SelectionDemo } from "@/stories/fixtures/search-demo";

import { SearchSelectionField } from "./search-selection-field";

const meta = {
  title: "Components/Search/Selection field",
  component: SearchSelectionField,
  parameters: {
    docs: {
      description: {
        component: "Selection results have no trailing arrow. Choosing a result updates the field.",
      },
    },
  },
} satisfies Meta<typeof SearchSelectionField>;
export default meta;
type Story = StoryObj;
export const Area: Story = { render: () => <SelectionDemo /> };
export const Companion: Story = { render: () => <SelectionDemo kind="climber" /> };
