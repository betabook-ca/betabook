import type { Meta, StoryObj } from "@storybook/react-vite";

import { DisciplineChip } from "@/components/climbing/discipline-chip";
import { Grade, GradeArrow } from "@/components/climbing/grade";
import { JournalEntryStatus } from "@/components/journal/journal-entry-layout";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

const meta = { title: "Patterns/Climbing data", component: StoryPage } satisfies Meta<
  typeof StoryPage
>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
export const LabelsAndGrades: Story = {
  render: () => (
    <StoryPage title="Labels and grades">
      <Example title="Disciplines">
        <div className="flex flex-wrap gap-2">
          {(["boulder", "sport", "trad"] as const).map((type) => (
            <DisciplineChip key={type} type={type} />
          ))}
        </div>
      </Example>
      <Example title="Outcomes">
        <div className="flex flex-wrap gap-4 text-sm">
          {(["Onsight", "Flash", "Redpoint"] as const).map((label) => (
            <JournalEntryStatus key={label} kind="send" label={label} />
          ))}
          <JournalEntryStatus kind="repeat" />
          <JournalEntryStatus kind="session" />
          <JournalEntryStatus kind="training" />
        </div>
      </Example>
      <Example title="Grades and community direction">
        <div className="flex gap-4">
          <Grade>
            V4
            <GradeArrow direction="up" label="Harder than posted" />
          </Grade>
          <Grade size="md">
            5.11a
            <GradeArrow direction="down" label="Softer than posted" />
          </Grade>
        </div>
      </Example>
      <Eyebrow>North Woods</Eyebrow>
    </StoryPage>
  ),
};
