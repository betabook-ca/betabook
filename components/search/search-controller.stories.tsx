import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { IntegratedSearchDemo } from "@/stories/fixtures/app-search-demo";

import { SearchController } from "./search-controller";
const meta = { title: "Components/Search/Controller", component: SearchController } satisfies Meta<
  typeof SearchController
>;
export default meta;
type Story = StoryObj;
export const Journey: Story = { render: () => <IntegratedSearchDemo surface="journey" /> };
export const Retry: Story = { render: () => <IntegratedSearchDemo failure /> };

export const MemberInitial: Story = {
  render: () => <IntegratedSearchDemo publicOnly={false} initialQuery="" />,
};

export const MemberQuickInitial: Story = {
  render: () => (
    <IntegratedSearchDemo publicOnly={false} initialQuery="" surface="quick" initialOpen />
  ),
};

export const MemberNoMatches: Story = {
  render: () => <IntegratedSearchDemo publicOnly={false} initialQuery="zzzz" />,
};

export const MemberQuickNoMatches: Story = {
  render: () => (
    <IntegratedSearchDemo publicOnly={false} initialQuery="zzzz" surface="quick" initialOpen />
  ),
};

export const PublicInitial: Story = {
  render: () => <IntegratedSearchDemo publicOnly={true} initialQuery="" />,
};

export const PublicQuickInitial: Story = {
  render: () => (
    <IntegratedSearchDemo publicOnly={true} initialQuery="" surface="quick" initialOpen />
  ),
};

export const PublicNoMatches: Story = {
  render: () => <IntegratedSearchDemo publicOnly={true} initialQuery="zzzz" />,
};

export const PublicQuickNoMatches: Story = {
  render: () => (
    <IntegratedSearchDemo publicOnly={true} initialQuery="zzzz" surface="quick" initialOpen />
  ),
};
