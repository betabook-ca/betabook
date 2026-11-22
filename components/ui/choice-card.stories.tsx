import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ArrowRight, Mountain } from "lucide-react";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ChoiceCard } from "./choice-card";

const meta = {
  title: "Components/Inputs/Choice card",
  component: ChoiceCard,
} satisfies Meta<typeof ChoiceCard>;
export default meta;
// These local-state examples supply their own component props.
type Story = StoryObj;

const OPTIONS = ["Send a number of climbs", "Reach a new grade"] as const;

function Selection() {
  const [chosen, setChosen] = useState<string>(OPTIONS[0]);
  return (
    <StoryPage
      title="Choice card"
      description="A multi-line outline button for picking one option of a step. Panel corners, wrapping text, and the hover fill while pressed."
    >
      <div className="grid auto-cols-fr grid-flow-col gap-3" role="group" aria-label="Goal">
        {OPTIONS.map((option) => (
          <ChoiceCard
            key={option}
            aria-pressed={chosen === option}
            onPress={() => setChosen(option)}
          >
            {option}
          </ChoiceCard>
        ))}
      </div>
    </StoryPage>
  );
}

/** A selection that stays on screen, as in the goal form's goal type. */
export const Pressed: Story = { render: () => <Selection /> };

/** The roomier size for an icon, a label and a description on one row. */
export const Large: Story = {
  render: () => (
    <StoryPage title="Choice card">
      <ChoiceCard size="lg">
        <Mountain aria-hidden className="size-5 shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">Climbing goals</span>
          <span className="text-sm font-normal text-muted">Build volume or reach a new grade.</span>
        </span>
        <ArrowRight aria-hidden className="size-4 shrink-0" />
      </ChoiceCard>
    </StoryPage>
  ),
};

/** A stacked label and description, as in the journal's entry-kind step. */
export const Stacked: Story = {
  render: () => (
    <StoryPage title="Choice card">
      <div className="grid grid-cols-2 gap-3">
        <ChoiceCard className="flex-col items-start">
          <span className="font-medium text-foreground">Outdoor session</span>
          <span className="mt-1 block text-sm font-normal text-muted">One climb, sent or not.</span>
        </ChoiceCard>
        <ChoiceCard className="flex-col items-start">
          <span className="font-medium text-foreground">Training</span>
          <span className="mt-1 block text-sm font-normal text-muted">
            Indoor climbing, strength, or conditioning.
          </span>
        </ChoiceCard>
      </div>
    </StoryPage>
  ),
};
