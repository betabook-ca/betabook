import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked } from "storybook/test";

import { createArea } from "@/actions";
import { fetchAreaSuggestions } from "@/lib/search-suggestions";
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
