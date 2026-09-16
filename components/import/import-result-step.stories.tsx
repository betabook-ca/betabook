import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ImportResultStep } from "./import-result-step";

const meta = {
  title: "Components/Import/Import result",
  component: ImportResultStep,
  args: {
    result: { imported: 48, overwritten: 0, alreadyLogged: 2, duplicates: 1, stopped: null },
    failures: [],
    profileHref: "#sample-sends",
    onDownload: () => {},
    onRestart: () => {},
  },
  decorators: [
    (Story) => (
      <StoryPage title="Import sends">
        <div className={cardClass("md")}>
          <Story />
        </div>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ImportResultStep>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Complete: Story = {};
export const Stopped: Story = {
  args: {
    result: {
      imported: 50,
      overwritten: 3,
      alreadyLogged: 2,
      duplicates: 0,
      stopped: { message: "Import cancelled." },
    },
    failures: [
      { rowIndex: 55, label: "Cedar Arete", reason: "The import stopped before this row." },
    ],
  },
};
