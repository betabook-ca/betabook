import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { Brand, BrandHomeLink } from "./brand";

const meta = {
  title: "Components/Navigation/Brand",
  component: Brand,
  decorators: [
    (Story) => (
      <StoryPage title="Betabook brand">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof Brand>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FullLockup: Story = {
  args: { variant: "lockup", className: "mx-auto w-full max-w-90" },
};
export const Compact: Story = { args: { variant: "icon", className: "size-12" } };
export const Navigation: Story = {
  render: () => (
    <div className="flex items-center justify-between gap-2 border-b border-separator py-3">
      <BrandHomeLink />
      <span className="text-sm text-muted">Climbing logbook</span>
    </div>
  ),
};
