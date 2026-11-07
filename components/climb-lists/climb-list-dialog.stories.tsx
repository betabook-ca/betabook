import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { climbListSamples } from "@/stories/fixtures/climb-lists";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbListDialog, type ClimbListDialogMode } from "./climb-list-dialog";

const meta = {
  title: "Components/Climb lists/List dialog",
  component: ClimbListDialog,
} satisfies Meta<typeof ClimbListDialog>;
export default meta;

function story(title: string, mode: ClimbListDialogMode, description?: string): StoryObj {
  return {
    render: function Example() {
      const state = useOverlayState({ defaultOpen: true });
      return (
        <StoryPage title={title} description={description}>
          <Button onPress={state.open}>Open</Button>
          <ClimbListDialog state={state} userId="alex" mode={mode} />
        </StoryPage>
      );
    },
  };
}

export const Create = story("New list", { kind: "create" });

export const Edit = story("Edit list", { kind: "edit", list: climbListSamples[0] });

export const CopyOwn = story(
  "Copy your own list",
  { kind: "copy", list: climbListSamples[0], own: true },
  "Copying your own list adds “(copy)” so the two can be told apart.",
);

export const CopyOthers = story(
  "Copy someone else's list",
  { kind: "copy", list: climbListSamples[0], own: false },
  "Copying someone else's list keeps their name as it is.",
);
