import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ImportReviewStep } from "./import-review-step";
import { WizardSteps } from "./wizard-steps";

const meta = {
  title: "Components/Import/Import review",
  component: ImportReviewStep,
  decorators: [
    (Story) => (
      <StoryPage title="Import sends">
        <div className={`flex flex-col gap-6 ${cardClass("fluid")}`}>
          <WizardSteps step="review" onJump={null} />
          <Story />
        </div>
      </StoryPage>
    ),
  ],
  args: {
    summary: { matched: 44, review: 3, attention: 2, picked: 1, skipped: 1, broken: 1, ready: 48 },
    invalid: [{ rowIndex: 12, raw: {}, reason: "Missing climb name" }],
    warnings: [
      {
        field: "rating",
        message: "Ratings above 5 stars were capped",
        count: 2,
        examples: ['Row 4: "6"', 'Row 9: "7"'],
      },
    ],
    pending: false,
    progress: null,
    onConflict: "skip",
    onConflictChange: () => {},
    cancelRequested: false,
    onCancel: () => {},
    onShowMatches: () => {},
    onBack: () => {},
    onImport: () => {},
  },
} satisfies Meta<typeof ImportReviewStep>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Overwrite: Story = { args: { onConflict: "overwrite" } };
export const Importing: Story = {
  args: {
    pending: true,
    onConflict: "overwrite",
    progress: {
      completed: 25,
      total: 48,
      imported: 20,
      overwritten: 3,
      alreadyLogged: 1,
      failed: 1,
      lastError: "The climb no longer exists",
    },
  },
};
