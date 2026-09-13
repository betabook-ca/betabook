import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { KayaImportProgress } from "./kaya-import-progress";

const meta = {
  title: "Components/Import/KAYA progress",
  component: KayaImportProgress,
  decorators: [
    (Story) => (
      <StoryPage title="Loading from KAYA">
        <Story />
      </StoryPage>
    ),
  ],
  args: { progress: { discipline: "boulder", loaded: 350, total: 872, retry: null } },
} satisfies Meta<typeof KayaImportProgress>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Loading: Story = {};
export const Connecting: Story = {
  args: { progress: { discipline: "boulder", loaded: 0, total: null, retry: null } },
};
export const RateLimited: Story = {
  args: {
    progress: {
      discipline: "boulder",
      loaded: 350,
      total: 872,
      retry: {
        reason: "rate-limit",
        attempt: 1,
        retryAt: new Date("2026-09-06T12:00:20-07:00").getTime(),
      },
    },
  },
};
