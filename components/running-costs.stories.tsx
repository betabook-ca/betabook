import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { RunningCosts } from "./running-costs";

const period = { periodStart: "2026-09-01", periodEnd: "2026-10-01" };

const meta = {
  title: "Components/Data display/Running costs",
  component: RunningCosts,
  args: {
    usage: {
      ...period,
      workerRequests: 1_420_000,
      workerCpuMs: 9_800_000,
      d1RowsRead: 2_300_000_000,
    },
    supportUrl: "https://support.example/betabook",
  },
  render: (args) => (
    <StoryPage title="Cost transparency">
      <RunningCosts {...args} />
    </StoryPage>
  ),
} satisfies Meta<typeof RunningCosts>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithinPlan: Story = {};

export const PastAllowance: Story = {
  args: {
    usage: {
      ...period,
      workerRequests: 6_100_000,
      workerCpuMs: 41_500_000,
      d1RowsRead: 31_200_000_000,
    },
  },
};

export const UsageUnavailable: Story = { args: { usage: null } };
