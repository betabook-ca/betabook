import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { JournalEntryDrawer } from "./journal-entry-drawer";

const meta = {
  title: "Components/Journal/Log popup",
  component: JournalEntryDrawer,
  parameters: {
    docs: {
      description: {
        component:
          "Log uses the same centered popup, primary heading and compact card layout as Set goal. Save remains at the bottom right.",
      },
    },
  },
} satisfies Meta<typeof JournalEntryDrawer>;
export default meta;
type Story = StoryObj;
function Example({
  climb = false,
  repeat = false,
  open = true,
}: {
  climb?: boolean;
  repeat?: boolean;
  open?: boolean;
}) {
  const state = useOverlayState({ defaultOpen: open });
  return (
    <StoryPage title={state.isOpen ? undefined : "Log an entry"}>
      <Button onPress={state.open}>Log</Button>
      <JournalEntryDrawer
        state={state}
        onSave={async () => ({ ok: true, value: undefined })}
        climb={
          climb ? { id: -1, areaId: -1, name: "Cedar Arete", type: "boulder", grade: 5 } : undefined
        }
        sentClimbIds={repeat ? new Set([-1]) : undefined}
      />
    </StoryPage>
  );
}
export const ChooseEntry: Story = { render: () => <Example /> };
export const Closed: Story = { render: () => <Example open={false} /> };
export const Training: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("button", { name: /^Training Indoor/ }),
    );
  },
};
export const Climb: Story = { render: () => <Example climb /> };
export const Send: Story = {
  render: () => <Example climb />,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("radio", {
        name: "Redpoint",
      }),
    );
  },
};
export const Repeat: Story = { render: () => <Example climb repeat /> };
