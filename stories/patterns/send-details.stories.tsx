import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import {
  AscentStylePicker,
  FormSection,
  GradeFeelField,
  SuggestedGradeField,
} from "@/components/send-fields";
import { RatingField } from "@/components/ui/rating-field";
import type { AscentStyle, GradeFeel } from "@/lib/sends";
import { StoryPage } from "@/stories/fixtures/story-layout";

const meta = { title: "Patterns/Send details", component: StoryPage } satisfies Meta<
  typeof StoryPage
>;
export default meta;
// These local-state/comparison examples supply their own component props.
type Story = StoryObj;
function SendExample() {
  const [ascent, setAscent] = useState<AscentStyle>("redpoint");
  const [rating, setRating] = useState<number | null>(null);
  const [grade, setGrade] = useState("");
  const [feel, setFeel] = useState<GradeFeel>("solid");
  return (
    <StoryPage
      title="Send details"
      description="The real send form sections with local values. No send is submitted."
    >
      <FormSection label="Ascent">
        <AscentStylePicker climbType="boulder" value={ascent} onChange={setAscent} />
      </FormSection>
      <FormSection label="Your opinion">
        <RatingField value={rating} onValueChange={setRating} />
        <SuggestedGradeField climbType="boulder" value={grade} onChange={setGrade} />
        <GradeFeelField value={feel} onChange={setFeel} />
      </FormSection>
    </StoryPage>
  );
}
export const SendDetails: Story = { render: () => <SendExample /> };
