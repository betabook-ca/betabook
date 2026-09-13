import { Input, Label, TextField } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { CollapsibleSection } from "./collapsible-section";

const meta = {
  title: "Components/Layout/Collapsible section",
  component: CollapsibleSection,
} satisfies Meta<typeof CollapsibleSection>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const ResponsiveSection: Story = {
  render: () => (
    <StoryPage
      title="Responsive section"
      description="Closed by default on phones, always open from the medium breakpoint. Resize after expanding to check state preservation."
    >
      <CollapsibleSection title="Climb filters">
        <TextField defaultValue="">
          <Label>Climb name</Label>
          <Input placeholder="Type here, then resize" />
        </TextField>
      </CollapsibleSection>
    </StoryPage>
  ),
};
