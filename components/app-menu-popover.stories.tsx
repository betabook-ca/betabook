import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useRef, useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { AppMenuPopover } from "./app-menu-popover";

const meta = {
  title: "Components/Navigation/Mobile menu",
  component: AppMenuPopover,
  args: {
    account: { id: "sample", name: "Alex Morgan", isAdmin: false },
    requestCount: 3,
    showPrimary: false,
    isOpen: false,
    triggerRef: { current: null },
    onClose: () => {},
    onOpenChange: () => {},
  },
  parameters: { nextjs: { navigation: { pathname: "/account" } } },
  render: function Render(args) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        <StoryPage title="Mobile navigation">
          <Button ref={triggerRef} onPress={() => setOpen(true)}>
            Open menu
          </Button>
        </StoryPage>
        <AppMenuPopover
          {...args}
          triggerRef={triggerRef}
          isOpen={open}
          onOpenChange={setOpen}
          onClose={() => setOpen(false)}
        />
      </>
    );
  },
} satisfies Meta<typeof AppMenuPopover>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SecondaryTools: Story = {};
export const PrimaryFallback: Story = {
  args: { showPrimary: true },
  parameters: { nextjs: { navigation: { pathname: "/tutorial/journal/journal" } } },
};
export const SignedOut: Story = { args: { account: null } };
