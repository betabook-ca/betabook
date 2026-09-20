import { Button, Label, TextArea, TextField, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { DatePickerField } from "./date-picker-field";
import { ResponsiveDialog, type DialogPresentation, type DialogSize } from "./responsive-dialog";
import { PageTitle } from "./typography";

const meta = {
  title: "Components/Feedback/Responsive dialog",
  component: ResponsiveDialog,
} satisfies Meta<typeof ResponsiveDialog>;
export default meta;
// These local-state examples supply their own component props.
type Story = StoryObj;

function Example({
  presentation = "sheet",
  size = "md",
  fields = 2,
  withFooter = false,
}: {
  presentation?: DialogPresentation;
  size?: DialogSize;
  fields?: number;
  withFooter?: boolean;
}) {
  const state = useOverlayState();
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("2026-09-19");
  const save = (
    <Button onPress={state.close} fullWidth>
      Save changes
    </Button>
  );
  return (
    <div className="flex flex-col items-start gap-4">
      <PageTitle>
        {presentation === "fullscreen" ? "A form too tall for a sheet" : "A short form"}
      </PageTitle>
      <p className="text-sm text-muted">
        Below md this is a {presentation === "fullscreen" ? "full screen" : "bottom sheet"}; from md
        up the same dialog centers itself at {size === "lg" ? "42rem" : "32rem"}. Sample interaction
        — nothing is saved.
      </p>
      <Button onPress={state.open}>Open dialog</Button>
      <ResponsiveDialog
        state={state}
        title="Report as broken"
        size={size}
        presentation={presentation}
        footer={withFooter ? save : undefined}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Once approved, only ascents dated before the break can be logged on this climb, and a
            new climb is created for the post-break line at the same grade.
          </p>
          <DatePickerField label="Date it broke" value={date} onChange={setDate} />
          {Array.from({ length: fields }, (_, index) => (
            <TextField key={index} value={reason} onChange={setReason}>
              <Label>{index === 0 ? "What happened" : `Extra detail ${index}`}</Label>
              <TextArea rows={3} placeholder="The crux flake came off in the spring thaw." />
            </TextField>
          ))}
          {!withFooter && (
            <Button onPress={state.close} fullWidth>
              Report as broken
            </Button>
          )}
        </div>
      </ResponsiveDialog>
    </div>
  );
}

/** The default: a bottom sheet under md, a 32rem centered modal from md up. */
export const Sheet: Story = { render: () => <Example /> };

/** Tall forms skip the sheet's 85vh cap — with a keyboard up it would leave a
 * porthole — and take the whole phone screen, with the primary action pinned
 * below the scrolling body instead of at the end of it. */
export const Fullscreen: Story = {
  render: () => <Example presentation="fullscreen" size="lg" fields={6} withFooter />,
};

/** Pickers need room for a result list on desktop without becoming a page. */
export const Wide: Story = { render: () => <Example size="lg" /> };
