import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useRef, useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import type { CompanionOption } from "@/lib/journal-companions";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { CompanionPicker } from "./companion-picker";

const meta = {
  title: "Components/Journal/Companion picker",
  component: CompanionPicker,
} satisfies Meta<typeof CompanionPicker>;
export default meta;
type Story = StoryObj;
const friends = [
  { id: "alex", name: "Alex Rivera", image: null },
  { id: "sam", name: "Sam With A Long Climbing Name", image: null },
  { id: "jo", name: "Jordan Lee", image: null },
];
function Example({
  full = false,
  failure = false,
  disabled = false,
}: {
  full?: boolean;
  failure?: boolean;
  disabled?: boolean;
}) {
  const failedOnce = useRef(false);
  const [selected, setSelected] = useState<CompanionOption[]>(
    full
      ? Array.from({ length: 10 }, (_, id) => ({
          id: String(id),
          name: `Climbing friend ${id + 1}`,
          image: null,
        }))
      : failure
        ? [friends[1]]
        : [],
  );
  return (
    <StoryPage
      title="Tagged friends"
      description="Friends tagged on one journal entry appear as removable buttons below the field."
    >
      <CompanionPicker
        value={selected}
        onChange={setSelected}
        editing
        disabled={disabled}
        fetcher={async (query) => {
          if (failure && !failedOnce.current) {
            failedOnce.current = true;
            throw new Error("Sample connection failure");
          }
          return friends.filter((friend) =>
            friend.name.toLowerCase().startsWith(query.toLowerCase()),
          );
        }}
      />
    </StoryPage>
  );
}
export const Selection: Story = { render: () => <Example /> };
export const Selected: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("combobox", { name: "Find a friend to tag" }), "Alex");
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", { name: "Alex Rivera" }),
    );
    await expect(canvas.getByRole("button", { name: "Remove friend Alex Rivera" })).toBeVisible();
  },
};
export const Maximum: Story = { render: () => <Example full /> };
export const Unavailable: Story = {
  render: () => <Example failure />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("combobox", { name: "Find a friend to tag" }), "Alex");
    await userEvent.tab();
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Couldn’t load friends");
  },
};
export const Saving: Story = { render: () => <Example full disabled /> };
