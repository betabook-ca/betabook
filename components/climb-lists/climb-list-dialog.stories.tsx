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

/** Opens on load; the button reopens it after closing. */
function OpenDialog({
  title,
  mode,
  description,
}: {
  title: string;
  mode: ClimbListDialogMode;
  description?: string;
}) {
  const state = useOverlayState({ defaultOpen: true });
  return (
    <StoryPage title={title} description={description}>
      <Button onPress={state.open}>Open</Button>
      <ClimbListDialog state={state} userId="alex" mode={mode} />
    </StoryPage>
  );
}

export const Create: StoryObj = {
  render: () => <OpenDialog title="New list" mode={{ kind: "create" }} />,
};

export const Edit: StoryObj = {
  render: () => <OpenDialog title="Edit list" mode={{ kind: "edit", list: climbListSamples[0] }} />,
};

export const CopyOwn: StoryObj = {
  render: () => (
    <OpenDialog
      title="Copy your own list"
      mode={{
        kind: "copy",
        list: climbListSamples[0],
        own: true,
        source: { listId: climbListSamples[0].id },
      }}
      description="Copying your own list adds “(copy)” so the two can be told apart."
    />
  ),
};

export const CopyOthers: StoryObj = {
  render: () => (
    <OpenDialog
      title="Copy someone else's list"
      mode={{
        kind: "copy",
        list: climbListSamples[0],
        own: false,
        source: { listId: climbListSamples[0].id },
      }}
      description="Copying someone else's list keeps their name as it is."
    />
  ),
};
