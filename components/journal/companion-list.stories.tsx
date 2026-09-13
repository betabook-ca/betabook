import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { CompanionList } from "./companion-list";

const meta = {
  title: "Components/Journal/Companion list",
  component: CompanionList,
} satisfies Meta<typeof CompanionList>;
export default meta;
type Story = StoryObj;
function Example({ error = false }: { error?: boolean }) {
  const [removed, setRemoved] = useState(false);
  const [failed, setFailed] = useState(error);
  return (
    <StoryPage
      title="Session companions"
      description="Visible companions only. Removing your tag leaves the author's entry intact."
    >
      <CompanionList
        companions={[
          { id: "sample-alex", name: "Alex Rivera", isSelf: false },
          ...(!removed
            ? [{ id: "sample-sam", name: "Sam With A Long Climbing Name", isSelf: true }]
            : []),
        ]}
        profileLinks={false}
        onRemoveSelf={() => {
          setFailed(false);
          setRemoved(true);
        }}
        error={failed ? "Couldn't remove your tag. Try again." : undefined}
      />
    </StoryPage>
  );
}
export const Companions: Story = { render: () => <Example /> };
export const RemovalError: Story = { render: () => <Example error /> };
