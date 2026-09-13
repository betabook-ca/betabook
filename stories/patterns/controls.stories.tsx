import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { DisciplineChips } from "@/components/filters/discipline-chips";
import { GradeFeelField } from "@/components/send-fields";
import type { Discipline } from "@/lib/grades";
import type { GradeFeel } from "@/lib/sends";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";
const meta = { title: "Patterns/Control comparisons", component: StoryPage } satisfies Meta<
  typeof StoryPage
>;
export default meta;
function ChoiceExamples() {
  const [feel, setFeel] = useState<GradeFeel>("solid");
  const [disciplines, setDisciplines] = useState<Discipline[]>(["boulder"]);
  const [discipline, setDiscipline] = useState<Discipline[]>(["sport"]);
  return (
    <StoryPage title="Segments and choice tags">
      <Example title="Exactly one choice">
        <GradeFeelField value={feel} onChange={setFeel} />
      </Example>
      <Example title="Multiple filter choices">
        <DisciplineChips value={disciplines} onChange={setDisciplines} />
      </Example>
      <Example title="One filter choice or none">
        <DisciplineChips single value={discipline} onChange={setDiscipline} />
      </Example>
    </StoryPage>
  );
}
export const Choices: StoryObj = { render: () => <ChoiceExamples /> };
