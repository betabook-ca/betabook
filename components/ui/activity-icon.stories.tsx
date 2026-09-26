import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { ActivityIcon, type ActivityKind } from "./activity-icon";

const KINDS: { kind: ActivityKind; label: string }[] = [
  { kind: "send", label: "Sent" },
  { kind: "repeat", label: "Repeat" },
  { kind: "session", label: "Session" },
  { kind: "training", label: "Training" },
];

const meta = {
  title: "Components/Data display/Activity icon",
  component: ActivityIcon,
  args: { kind: "send" },
} satisfies Meta<typeof ActivityIcon>;
export default meta;
// The example lays out every kind itself.
type Story = StoryObj;

/** All four marks on the two surfaces that carry them. Only the send is
 * tinted; the rest share one neutral disc that keeps its contrast in Ink. */
export const Kinds: Story = {
  render: () => (
    <StoryPage title="Activity icons">
      <Example title="On a card">
        <div className={`flex flex-wrap gap-4 ${cardClass("sm")}`}>
          {KINDS.map(({ kind, label }) => (
            <span key={kind} className="inline-flex items-center gap-1.5 text-sm">
              <ActivityIcon kind={kind} />
              {label}
            </span>
          ))}
        </div>
      </Example>
      <Example title="In list rows">
        <ul className="divide-y divide-separator rounded-panel border border-border">
          {KINDS.map(({ kind, label }) => (
            <li key={kind} className="flex items-center gap-3 px-4 py-3 text-sm">
              <ActivityIcon kind={kind} />
              <span className="font-medium">{label}</span>
              <span className="text-muted">Cedar Arete</span>
            </li>
          ))}
        </ul>
      </Example>
    </StoryPage>
  ),
};
