import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  IntegratedSearchDemo,
  IntegratedClimbPickerDemo,
} from "@/stories/fixtures/app-search-demo";
import { ClimbPickerDemo, SearchDemo, SelectionDemo } from "@/stories/fixtures/search-demo";

const meta = { title: "Patterns/Search", component: SearchDemo } satisfies Meta<typeof SearchDemo>;
export default meta;
type Story = StoryObj;

export const QuickSearch: Story = { render: () => <IntegratedSearchDemo surface="quick" /> };
export const FullResults: Story = { render: () => <IntegratedSearchDemo /> };
export const SearchJourney: Story = { render: () => <IntegratedSearchDemo surface="journey" /> };
export const ClimbPicker: Story = { render: () => <IntegratedClimbPickerDemo /> };
export const ImportPicker: Story = { render: () => <IntegratedClimbPickerDemo mode="import" /> };
export const MergePicker: Story = { render: () => <IntegratedClimbPickerDemo mode="merge" /> };
export const AreaPicker: Story = { render: () => <SelectionDemo /> };
export const CompanionPicker: Story = { render: () => <SelectionDemo kind="climber" /> };
export const Initial: Story = { render: () => <IntegratedSearchDemo initialQuery="" /> };
export const ClimberSuggestions: Story = {
  render: () => <IntegratedSearchDemo initialQuery="" initialCategory="climber" suggestions />,
};
export const SignedOut: Story = { render: () => <IntegratedSearchDemo publicOnly /> };
export const SignedOutClimbs: Story = {
  render: () => <IntegratedSearchDemo publicOnly initialCategory="climb" />,
};
export const Loading: Story = { render: () => <SearchDemo scenario="loading" /> };
export const NoMatches: Story = { render: () => <SearchDemo scenario="empty" /> };
export const Failed: Story = { render: () => <SearchDemo scenario="error" /> };
export const PartialFailure: Story = { render: () => <SearchDemo scenario="partial-error" /> };
export const LongNameAndMissingGrade: Story = { render: () => <SearchDemo scenario="long-name" /> };
export const SelectedClimb: Story = { render: () => <ClimbPickerDemo selectedInitially /> };

export const QuickInitial: Story = {
  render: () => <IntegratedSearchDemo surface="quick" initialQuery="" initialOpen />,
};
export const QuickLoading: Story = {
  render: () => <SearchDemo surface="quick" scenario="loading" initialOpen />,
};
export const QuickNoMatches: Story = {
  render: () => <SearchDemo surface="quick" scenario="empty" initialOpen />,
};
export const QuickFailed: Story = {
  render: () => <SearchDemo surface="quick" scenario="error" initialOpen />,
};
export const QuickPartialFailure: Story = {
  render: () => <SearchDemo surface="quick" scenario="partial-error" initialOpen />,
};

export const NetworkRetry: Story = { render: () => <IntegratedSearchDemo failure /> };
export const PaginationRetry: Story = { render: () => <IntegratedSearchDemo pageFailure /> };
