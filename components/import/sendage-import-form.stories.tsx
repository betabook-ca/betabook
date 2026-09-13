import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { SendageImportForm } from "./sendage-import-form";

const meta = {
  title: "Components/Import/Sendage import form",
  component: SendageImportForm,
  decorators: [
    (Story) => (
      <StoryPage
        title="Import sends"
        description="Enter a public Sendage profile to import your sends."
      >
        <Story />
      </StoryPage>
    ),
  ],
  args: {
    disabled: true,
    onLoaded: () => {},
    onBusyChange: () => {},
  },
} satisfies Meta<typeof SendageImportForm>;
export default meta;
type Story = StoryObj<typeof meta>;
// Transport is disabled in gallery examples; live interactions are tested in jsdom.
export const NewProfile: Story = {};
export const EnteredProfile: Story = { args: { initialUsername: "weekend_climber" } };
