import type { Meta, StoryObj } from "@storybook/react-vite";
import { mocked } from "storybook/test";

import { fetchAreaSuggestions } from "@/lib/search-suggestions";
import { createArea } from "@/spa/lib/actions-client";
import { searchAreaFetcher } from "@/stories/fixtures/app-search-demo";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AreaForm } from "./area-form";

const meta = {
  title: "Components/Forms/Area form",
  beforeEach: () => {
    mocked(createArea).mockResolvedValue({ ok: true, value: -1 });
    mocked(fetchAreaSuggestions).mockImplementation(searchAreaFetcher);
    return () => {
      mocked(createArea).mockReset();
      mocked(fetchAreaSuggestions).mockReset();
    };
  },
  component: AreaForm,
  args: { parentId: null },
  decorators: [
    (Story) => (
      <StoryPage title="Add area">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof AreaForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NewArea: Story = {};
export const FixedParent: Story = { args: { parentId: 1 } };
