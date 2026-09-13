import { Label, TextArea, TextField } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { FieldFeedback, FieldHeader } from "./field-support";

const meta = {
  title: "Components/Inputs/Field support",
  component: FieldHeader,
  decorators: [
    (Story) => (
      <StoryPage
        title="Field limits and feedback"
        description="Place used/limit and its unit (friends, characters, or tags) at the right of the label row, aligned to the field edge. The counter wraps below the label when space is tight. Helper text sits below the input. An error replaces the helper; the counter remains visible. Reaching a limit is neutral, exceeding it is invalid. Character counters do not announce every keystroke; selection counts announce changes."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof FieldHeader>;
export default meta;
type Story = StoryObj;
function Notes({ initial = "", limit = 2000 }: { initial?: string; limit?: number }) {
  const [value, setValue] = useState(initial);
  const error =
    value.length > limit ? `Use at most ${limit.toLocaleString("en-US")} characters.` : null;
  return (
    <TextField
      className={FIELD_WIDTH_CLASS.long}
      value={value}
      onChange={setValue}
      isInvalid={!!error}
    >
      <FieldHeader usage={{ used: value.length, limit, unit: "characters" }}>
        <Label>How'd it go?</Label>
      </FieldHeader>
      <TextArea />
      <FieldFeedback helper="Conditions, beta, how it felt…" error={error} />
    </TextField>
  );
}
export const Empty: Story = { render: () => <Notes /> };
export const WithHelper: Story = {
  render: () => <Notes initial="Cool conditions and good friction." />,
};
export const AtLimit: Story = { render: () => <Notes initial="Great day!" limit={10} /> };
export const Invalid: Story = { render: () => <Notes initial="Great day outside!" limit={10} /> };
