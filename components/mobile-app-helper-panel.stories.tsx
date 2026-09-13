import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { MobileAppHelperPanel } from "./mobile-app-helper-panel";

const meta = {
  title: "Components/Feedback/Mobile app helper",
  component: MobileAppHelperPanel,
  args: { installPrompt: null, onDismiss: () => {}, onNativeInstall: () => {} },
  render: function Example(args) {
    const [dismissed, setDismissed] = useState(false);
    return dismissed ? (
      <>
        <p role="status">Shortcut helper dismissed.</p>
        <Button onPress={() => setDismissed(false)}>Show helper again</Button>
      </>
    ) : (
      <MobileAppHelperPanel {...args} onDismiss={() => setDismissed(true)} />
    );
  },
  decorators: [
    (Story) => (
      <StoryPage
        title="Home screen shortcut helper"
        description="Floating content uses overlay fill, one border and shadow. Nested instructions use an opaque inset and 16px padding."
      >
        <div className="relative min-h-128 transform-[translateZ(0)]">
          <Story />
        </div>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof MobileAppHelperPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Instructions: Story = {};
