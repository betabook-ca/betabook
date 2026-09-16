import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { MountainProjectImportForm } from "./mountain-project-import-form";

const meta = {
  title: "Components/Import/Mountain Project import form",
  component: MountainProjectImportForm,
  decorators: [
    (Story) => (
      <StoryPage
        title="Import sends"
        description="Enter a Mountain Project profile to import your ticks."
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
} satisfies Meta<typeof MountainProjectImportForm>;
export default meta;
type Story = StoryObj<typeof meta>;
// Transport is disabled in gallery examples; live interactions are tested in jsdom.
export const NewProfile: Story = {};
export const EnteredProfile: Story = { args: { initialUserId: "200226064" } };
