import { Input, Label, TextField } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { DetailsDisclosure } from "./details-disclosure";

const meta = {
  title: "Components/Layout/Details disclosure",
  component: DetailsDisclosure,
} satisfies Meta<typeof DetailsDisclosure>;
export default meta;
// These local-state examples supply their own component props.
type Story = StoryObj;

function Example({ initiallyExpanded = false }: { initiallyExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  return (
    <StoryPage
      title="Details disclosure"
      description="A form's optional fields behind an eyebrow-styled trigger, collapsed by default at every viewport size. The owning form controls expansion so it can reopen the section when a hidden field needs attention."
    >
      <DetailsDisclosure title="Add details" isExpanded={expanded} onExpandedChange={setExpanded}>
        <TextField defaultValue="">
          <Label>Optional note</Label>
          <Input placeholder="Only needed sometimes" />
        </TextField>
      </DetailsDisclosure>
    </StoryPage>
  );
}

export const Collapsed: Story = { render: () => <Example /> };
export const Expanded: Story = { render: () => <Example initiallyExpanded /> };
