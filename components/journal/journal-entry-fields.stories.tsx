import { Button } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { userEvent, within } from "storybook/test";

import { StoryPage } from "@/stories/fixtures/story-layout";

import { JournalEntryFields } from "./journal-entry-fields";

const meta = {
  title: "Components/Journal/Entry fields",
  component: JournalEntryFields,
} satisfies Meta<typeof JournalEntryFields>;
export default meta;
type Story = StoryObj;

function Example({
  rope = false,
  repeat = false,
  training = false,
  failure = false,
  slow = false,
}: {
  rope?: boolean;
  repeat?: boolean;
  training?: boolean;
  failure?: boolean;
  slow?: boolean;
}) {
  const [submissions, setSubmissions] = useState<
    { undated: boolean; fields: [string, FormDataEntryValue][] }[]
  >([]);
  const [completed, setCompleted] = useState(0);
  const release = useRef<(() => void) | null>(null);
  return (
    <StoryPage
      title="Log an entry"
      description="The session-or-send pills come first: Session logs plain time on the climb, while Redpoint, Flash, or Onsight marks a send in that style. A climb already sent offers Session or Repeat instead — a repeat records another sent day without touching the ascent. Then the date, the ascent opinion, and Notes filling the form width. Friends and Tags wait behind Add details, collapsed by default. With a send style chosen on a first ascent, the I don't know checkbox beside the date empties it to record a send without one; repeats always need a date, so they never offer it. Local save boundary. Submitted entries show the real form payload, including friend identities, notes, dates and tags. No account data is written."
    >
      <JournalEntryFields
        today="2026-09-06"
        kind={training ? "training" : "session"}
        climb={
          training
            ? undefined
            : {
                id: -1,
                areaId: -1,
                name: "Cedar Arete",
                type: rope ? "sport" : "boulder",
                grade: 5,
              }
        }
        hasPriorSend={repeat}
        companionFetcher={async (query) =>
          [
            { id: "sample-sam", name: "Sam Rivera" },
            { id: "sample-alex", name: "Alex Rivera" },
          ].filter((friend) => friend.name.toLowerCase().startsWith(query.toLowerCase()))
        }
        onSave={async (form, undated) => {
          // The save boundary records requests immediately, even while React's
          // caller transition waits for our deliberately deferred response.
          flushSync(() =>
            setSubmissions((previous) => [
              ...previous,
              { undated, fields: Array.from(form.entries()) },
            ]),
          );
          if (slow)
            await new Promise<void>((resolve) => {
              release.current = resolve;
            });
          if (failure && submissions.length === 0)
            return { ok: false, error: "Couldn't save the entry. Try again." };
          return { ok: true, value: undefined };
        }}
        onDone={() => setCompleted((count) => count + 1)}
      />
      {slow && (
        <Button
          onPress={() => {
            release.current?.();
            release.current = null;
          }}
        >
          Finish sample save
        </Button>
      )}
      <p role="status">Completed saves: {completed}</p>
      <output aria-label="Submitted entries" className="text-xs break-all">
        {JSON.stringify(submissions)}
      </output>
    </StoryPage>
  );
}

export const Outdoor: Story = { render: () => <Example /> };
export const Repeat: Story = { render: () => <Example repeat /> };
export const Training: Story = { render: () => <Example training /> };
export const SaveFailure: Story = { render: () => <Example failure /> };
export const Saving: Story = { render: () => <Example slow /> };

export const RepeatChosen: Story = {
  render: () => <Example repeat />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("radio", { name: "Repeat" }));
  },
};

export const Ascent: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("radio", { name: "Redpoint" }));
  },
};
export const RopeAscent: Story = { render: () => <Example rope />, play: Ascent.play };
export const AscentDetails: Story = {
  render: () => <Example />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "Redpoint" }));
    await userEvent.click(canvas.getByRole("button", { name: "Add details" }));
  },
};
