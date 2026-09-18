import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked } from "storybook/test";

import { requestClimbEdit } from "@/actions";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbEditRequestDrawer } from "./climb-edit-request-drawer";

const meta = {
  title: "Components/Forms/Climb edit request",
  component: ClimbEditRequestDrawer,
  beforeEach: () => {
    mocked(requestClimbEdit).mockResolvedValue({ ok: true, value: { status: "pending" } });
    return () => mocked(requestClimbEdit).mockReset();
  },
} satisfies Meta<typeof ClimbEditRequestDrawer>;
export default meta;

export const Ungraded: StoryObj = {
  render: function Example() {
    const state = useOverlayState();
    return (
      <StoryPage title="Edit an ungraded climb">
        <Button onPress={state.open}>Request climb edit</Button>
        <ClimbEditRequestDrawer
          state={state}
          climb={{
            id: -1,
            areaId: -1,
            name: "Unfinished Arete",
            type: "boulder",
            grade: null,
            description: null,
            brokenOn: null,
            sendCount: 0,
            ratingSum: 0,
            ratingCount: 0,
            avgRating: null,
          }}
        />
      </StoryPage>
    );
  },
};
