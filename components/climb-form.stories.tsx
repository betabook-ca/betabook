import type { Meta, StoryObj } from "@storybook/react-vite";
import { mocked } from "storybook/test";

import { fetchAreaSuggestions } from "@/lib/search-suggestions";
import { createClimb } from "@/spa/lib/actions-client";
import { searchAreaFetcher } from "@/stories/fixtures/app-search-demo";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbForm } from "./climb-form";

const meta = {
  title: "Components/Forms/Climb form",
  beforeEach: () => {
    mocked(createClimb).mockResolvedValue({ ok: true, value: -1 });
    mocked(fetchAreaSuggestions).mockImplementation(searchAreaFetcher);
    return () => {
      mocked(createClimb).mockReset();
      mocked(fetchAreaSuggestions).mockReset();
    };
  },
  component: ClimbForm,
  args: { areaId: null },
  decorators: [
    (Story) => (
      <StoryPage title="Add climb">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ClimbForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NewClimb: Story = {};
export const FixedArea: Story = { args: { areaId: 1, initial: { type: "sport" } } };
