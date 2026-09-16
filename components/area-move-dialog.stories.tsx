import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked } from "storybook/test";

import { fetchAreaSuggestions } from "@/lib/search-suggestions";
import { searchAreaFetcher } from "@/stories/fixtures/app-search-demo";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AreaMoveDialog } from "./area-move-dialog";

const meta = {
  title: "Components/Forms/Area move dialog",
  component: AreaMoveDialog,
  beforeEach: () => {
    mocked(fetchAreaSuggestions).mockImplementation(searchAreaFetcher);
    return () => mocked(fetchAreaSuggestions).mockReset();
  },
} satisfies Meta<typeof AreaMoveDialog>;
export default meta;

export const QueuedMove: StoryObj = {
  render: function Example() {
    const state = useOverlayState({ defaultOpen: true });
    return (
      <StoryPage title="Move a climb or area">
        <Button onPress={state.open}>Open move</Button>
        <AreaMoveDialog
          state={state}
          title="Move to a different area"
          pendingMessage="An admin needs to approve this before the climb actually moves."
          onMove={async () => ({ ok: true, value: { status: "pending" } })}
        />
      </StoryPage>
    );
  },
};
