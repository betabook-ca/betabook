import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { DeferredLoadError } from "./deferred-load-error";

const meta = {
  title: "Components/Feedback/Deferred load error",
  component: DeferredLoadError,
  args: { feature: "the entry form", onRetry: () => {}, onDismiss: () => {} },
  render: function Example(args) {
    const [visible, setVisible] = useState(true);
    const [message, setMessage] = useState("");
    return (
      <StoryPage title="Feature loading">
        <p role="status">{message}</p>
        {visible && (
          <DeferredLoadError
            {...args}
            onRetry={() => {
              setVisible(false);
              setMessage("The sample feature is ready.");
            }}
            onDismiss={() => setVisible(false)}
          />
        )}
      </StoryPage>
    );
  },
} satisfies Meta<typeof DeferredLoadError>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Retry: Story = {};
