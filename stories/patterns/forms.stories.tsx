import { Button, FieldError, Input, Label, TextField } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { cardClass } from "@/components/ui/card";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FIELD_CLASS, FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { PageTitle, SectionHeading } from "@/components/ui/typography";
import { StoryPage } from "@/stories/fixtures/story-layout";

const meta = { title: "Patterns/Forms", component: StoryPage } satisfies Meta<typeof StoryPage>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
function FormExamples() {
  const [date, setDate] = useState("2026-09-01");
  return (
    <div className="flex flex-col gap-6">
      <PageTitle>Fields and actions</PageTitle>
      <p className="text-sm text-muted">
        Visual comparison of native and HeroUI fields, error and disabled states, and button
        treatments. This is not a submission workflow.
      </p>
      <section className={`flex flex-col gap-4 ${cardClass()}`}>
        <SectionHeading>Session details</SectionHeading>
        <TextField className={FIELD_WIDTH_CLASS.long} name="climb" defaultValue="Cedar Arete">
          <Label>Climb name</Label>
          <Input />
        </TextField>
        <TextField className={FIELD_WIDTH_CLASS.medium} name="discipline">
          <Label htmlFor="sample-discipline">Discipline</Label>
          <select id="sample-discipline" className={FIELD_CLASS} defaultValue="boulder">
            <option value="boulder">Boulder</option>
            <option value="sport">Sport</option>
            <option value="trad">Trad</option>
          </select>
        </TextField>
        <DatePickerField label="Session date" value={date} onChange={setDate} max="2026-09-06" />
        <TextField className={FIELD_WIDTH_CLASS.long} isInvalid name="comment">
          <Label>Comment</Label>
          <Input defaultValue="" />
          <FieldError>Enter a comment for this example.</FieldError>
        </TextField>
        <TextField
          className={FIELD_WIDTH_CLASS.long}
          isDisabled
          name="readonly"
          defaultValue="Unavailable"
        >
          <Label>Unavailable field</Label>
          <Input />
        </TextField>
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button isDisabled>Saving…</Button>
        </div>
      </section>
    </div>
  );
}
export const Forms: Story = { render: () => <FormExamples /> };
