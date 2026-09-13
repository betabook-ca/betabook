import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { KayaImportForm } from "./kaya-import-form";

const meta = {
  title: "Components/Import/KAYA import form",
  component: KayaImportForm,
  decorators: [
    (Story) => (
      <StoryPage
        title="Import sends"
        description="Enter a public KAYA profile to import outdoor boulders and routes."
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
} satisfies Meta<typeof KayaImportForm>;
export default meta;
type Story = StoryObj<typeof meta>;
// Transport is disabled in gallery examples; live interactions are tested in jsdom.
export const NewProfile: Story = {};
export const EnteredProfile: Story = { args: { initialUsername: "weekend_climber" } };
