import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked } from "storybook/test";

import { requestAreaEdit } from "@/actions";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AreaEditRequestDrawer } from "./area-edit-request-drawer";

const meta = {
  title: "Components/Forms/Area edit request",
  component: AreaEditRequestDrawer,
  beforeEach: () => {
    mocked(requestAreaEdit).mockResolvedValue({ ok: true, value: { status: "pending" } });
    return () => mocked(requestAreaEdit).mockReset();
  },
} satisfies Meta<typeof AreaEditRequestDrawer>;
export default meta;

export const Rename: StoryObj = {
  render: function Example() {
    const state = useOverlayState();
    return (
      <StoryPage title="Rename an area">
        <Button onPress={state.open}>Request area rename</Button>
        <AreaEditRequestDrawer
          state={state}
          area={{ id: -1, parentId: null, name: "Cedar Grove", description: null }}
        />
      </StoryPage>
    );
  },
};
