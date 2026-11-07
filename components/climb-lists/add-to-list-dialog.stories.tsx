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

function story(fetcher: () => Promise<ClimbListChoice[]>, description?: string): StoryObj {
  return {
    render: function Example() {
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
    },
  };
}

export const Default = story(
  async () => climbListChoiceSamples,
  "One checkbox per list, each saving on its own. The climb is already on the first.",
);

export const NoLists = story(async () => []);

export const Loading = story(() => new Promise(() => {}), "While the lists load.");
