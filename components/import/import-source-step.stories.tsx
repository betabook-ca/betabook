import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ImportSourceStep } from "./import-source-step";
import { WizardSteps } from "./wizard-steps";

const meta = {
  title: "Components/Import/Import source",
  component: ImportSourceStep,
  decorators: [
    (Story) => (
      <StoryPage title="Import sends">
        <div className={`flex flex-col gap-6 ${cardClass("fluid")}`}>
          <WizardSteps step="upload" onJump={null} />
          <Story />
        </div>
      </StoryPage>
    ),
  ],
  args: { disabled: true, onFile: () => {}, onLoaded: () => {} },
} satisfies Meta<typeof ImportSourceStep>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Sendage: Story = {};
export const Kaya: Story = { args: { initialSource: "kaya" } };
export const Csv: Story = { args: { initialSource: "csv" } };
