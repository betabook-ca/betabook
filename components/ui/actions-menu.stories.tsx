import { Menu } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { ActionsMenu } from "./actions-menu";

const meta = { title: "Components/Navigation/Actions menu", component: ActionsMenu } satisfies Meta<
  typeof ActionsMenu
>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
function MenuExample() {
  const [action, setAction] = useState("None");
  return (
    <StoryPage title="Actions menu">
      <div className="flex items-center justify-between">
        <span>Cedar Arete</span>
        <ActionsMenu ariaLabel="Sample climb actions" onAction={(key) => setAction(String(key))}>
          <Menu.Item id="edit">Edit climb</Menu.Item>
          <Menu.Item id="move">Move climb</Menu.Item>
          <Menu.Item id="delete" variant="danger">
            Delete climb
          </Menu.Item>
        </ActionsMenu>
      </div>
      <p role="status">Action: {action}</p>
    </StoryPage>
  );
}
export const Actions: Story = { render: () => <MenuExample /> };
