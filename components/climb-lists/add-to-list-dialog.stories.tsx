import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { ClimbListChoice } from "@/db/queries";
import { climbListChoiceSamples } from "@/stories/fixtures/climb-lists";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AddToListDialog } from "./add-to-list-dialog";

const meta = {
  title: "Components/Climb lists/Add to list",
  component: AddToListDialog,
} satisfies Meta<typeof AddToListDialog>;
export default meta;

/** Opens on load; the button reopens it after closing. */
function OpenDialog({
  fetcher,
  description,
}: {
  fetcher: () => Promise<ClimbListChoice[]>;
  description?: string;
}) {
  const state = useOverlayState({ defaultOpen: true });
  return (
    <StoryPage title="Add to list" description={description}>
      <Button onPress={state.open}>Open</Button>
      <AddToListDialog
        state={state}
        userId="alex"
        climb={{ id: 101, name: "Amarillo Sunset" }}
        fetcher={fetcher}
      />
    </StoryPage>
  );
}

export const Default: StoryObj = {
  render: () => (
    <OpenDialog
      fetcher={async () => climbListChoiceSamples}
      description="One checkbox per list, each saving on its own. The climb is already on the first."
    />
  ),
};

export const NoLists: StoryObj = {
  render: () => <OpenDialog fetcher={async () => []} />,
};

export const Loading: StoryObj = {
  render: () => (
    <OpenDialog fetcher={() => new Promise(() => {})} description="While the lists load." />
  ),
};
