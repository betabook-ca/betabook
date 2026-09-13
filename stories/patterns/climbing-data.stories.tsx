import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MapPin } from "lucide-react";

import { AscentStyle } from "@/components/ascent-style";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Grade, GradeArrow } from "@/components/ui/grade";
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
      <Example title="Ascent styles">
        <div className="flex flex-wrap gap-2">
          {(["onsight", "flash", "redpoint"] as const).map((type) => (
            <AscentStyle key={type} type={type} />
          ))}
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
      <Eyebrow icon={MapPin}>North Woods</Eyebrow>
    </StoryPage>
  ),
};
