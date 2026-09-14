import { Button, Modal } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { GoalForm } from "./goal-form";
const meta = {
  title: "Components/Goals/Goal form",
  component: GoalForm,
  args: { today: "2026-09-11", nextGrades: { boulder: 6, sport: 6, trad: 6 }, embedded: true },
  decorators: [
    function GoalFormPopup(Story) {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Button onPress={() => setOpen(true)}>Set goal</Button>
          <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
            <Modal.Container placement="center" scroll="inside">
              <Modal.Dialog className="w-full max-w-lg">
                <Modal.Header>
                  <Modal.Heading className="sr-only">Set goal</Modal.Heading>
                  <Modal.CloseTrigger />
                </Modal.Header>
                <Modal.Body>
                  <Story />
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </>
      );
    },
  ],
  parameters: {
    docs: {
      description: {
        component:
          "The real journal goal editor. Sentence controls, recurrence, custom dates, and validation are shared with the app. Journal placement and history compositions live under Patterns / Goals.",
      },
    },
  },
} satisfies Meta<typeof GoalForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Categories: Story = {};
export const Climbing: Story = { args: { initialCategory: "climbing" } };
export const Training: Story = { args: { initialCategory: "training" } };
export const Recurring: Story = { args: { initialCategory: "training", initialRepeat: "week" } };
export const MonthlyTraining: Story = {
  args: { initialCategory: "training", initialRepeat: "month" },
};
export const SeasonalGoal: Story = {
  args: {
    initialCategory: "climbing",
    initialCustomDate: true,
    initialStartDate: "2026-09-01",
    initialEndDate: "2026-11-30",
  },
};
export const TrainingCustomRange: Story = {
  args: {
    initialCategory: "training",
    initialCustomDate: true,
    initialStartDate: "2026-09-01",
    initialEndDate: "2026-11-30",
  },
};
export const NewGrade: Story = { args: { initialCategory: "climbing", initialGoal: "grade" } };
export const NewGradeCustomRange: Story = { args: { ...SeasonalGoal.args, initialGoal: "grade" } };
export const Explore: Story = { args: { initialCategory: "explore" } };
export const WeeklyClimbingDays: Story = {
  args: { initialCategory: "explore", initialRepeat: "week" },
};
export const NewAreas: Story = { args: { initialCategory: "explore", initialGoal: "new-areas" } };
export const NewAreasCustomRange: Story = {
  args: { ...SeasonalGoal.args, initialCategory: "explore", initialGoal: "new-areas" },
};
export const MonthlyNewAreas: Story = { args: { ...NewAreas.args, initialRepeat: "month" } };
export const WeeklyClimbs: Story = { args: { initialCategory: "climbing", initialRepeat: "week" } };
export const YearlyClimbs: Story = { args: { initialCategory: "climbing", initialRepeat: "year" } };
export const MinimumGrade: Story = {
  args: {
    initialDraft: {
      category: "climbing",
      goal: "volume",
      discipline: "boulder",
      grade: "6",
      gradeMatch: "at-least",
      amount: "8",
      period: "year",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      repeat: "none",
    },
  },
};
