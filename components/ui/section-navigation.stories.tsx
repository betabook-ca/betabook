import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { SectionNavigation } from "./section-navigation";

const meta = {
  title: "Components/Navigation/Section navigation",
  component: SectionNavigation,
  decorators: [
    (Story) => (
      <StoryPage title="Section navigation">
        <Story />
      </StoryPage>
    ),
  ],
  args: {
    label: "Logbook sections",
    tabs: [
      { href: "/users/sample/journal", label: "Journal", current: true },
      { href: "/users/sample/sends", label: "Sends", current: false },
    ],
  },
  parameters: {
    docs: {
      description: {
        component:
          "Shared section navigation for profiles, workspaces and local list views. Links identify the current page; callback choices use stable IDs so changing counts preserve focus. Callers supply the navigation's accessible label.",
      },
    },
  },
} satisfies Meta<typeof SectionNavigation>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Links: Story = {};
export const Workspace: Story = { args: { appearance: "workspace" } };
export const Choices: Story = {
  args: { label: "Goal views", appearance: "pills" },
  render: function Choices(args) {
    const [view, setView] = useState("active");
    return (
      <SectionNavigation
        {...args}
        tabs={[
          {
            id: "active",
            label: "Active (2/5)",
            current: view === "active",
            onSelect: () => setView("active"),
          },
          {
            id: "history",
            label: "History (12)",
            current: view === "history",
            onSelect: () => setView("history"),
          },
        ]}
      />
    );
  },
};
