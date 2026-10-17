import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { Grade } from "./grade";
import { GradeArrow, GradeSuggestion } from "./grade";
import { GradeLabel } from "./grade-label";
import { GradePreferencesProvider } from "./grade-preferences";
const meta = {
  title: "Components/Data display/Grade",
  component: Grade,
  args: { children: "V4" },
  decorators: [
    (Story) => (
      <StoryPage title="Grade">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof Grade>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Boulder: Story = {};
export const Rope: Story = {
  args: {
    size: "md",
    children: (
      <>
        5.11a
        <GradeArrow direction="down" label="Softer than posted" />
      </>
    ),
  },
};
export const Harder: Story = {
  args: {
    children: (
      <>
        V4
        <GradeArrow direction="up" label="Harder than posted" />
      </>
    ),
  },
};
/** The same ordinals printed for a climber whose account reads Fontainebleau
 * and French. `GradeLabel` formats through the provider the app mounts per
 * request, so a server component passes an ordinal and never the label. */
export const EuropeanSystems: Story = {
  args: {
    size: "md",
    children: (
      <GradePreferencesProvider value={{ boulder: "font", rope: "french" }}>
        <GradeLabel type="boulder" grade={5} />
        <span className="mx-2 text-muted">·</span>
        <GradeLabel type="sport" grade={17} />
        <GradeSuggestion arrow={<GradeArrow direction="up" label="Harder than posted" />}>
          <GradeLabel type="sport" grade={18} />
        </GradeSuggestion>
      </GradePreferencesProvider>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          "V4 reads 6B and 5.11d reads 7a with its 7a+ suggestion. Nothing stored changes; only the account's grading systems do.",
      },
    },
  },
};
export const SuggestedHarder: Story = {
  args: {
    children: (
      <>
        V4
        <GradeSuggestion arrow={<GradeArrow direction="up" label="Harder than posted" />}>
          V5
        </GradeSuggestion>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          "A differing suggestion sits in parentheses with its arrow inside them, so the sign reads as part of the suggestion and cannot wrap onto its own line.",
      },
    },
  },
};
