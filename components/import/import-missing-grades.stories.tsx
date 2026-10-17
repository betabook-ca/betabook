import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import type { ClimbCandidate } from "@/db/queries";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ImportMissingGrades } from "./import-missing-grades";

function climb(id: number, name: string, overrides: Partial<ClimbCandidate> = {}): ClimbCandidate {
  return {
    id,
    name,
    key: name.toLowerCase(),
    type: "sport",
    grade: 14,
    areaId: id,
    areaName: "Echo Beach",
    sendCount: 3,
    brokenOn: null,
    ancestors: [],
    total: 1,
    ...overrides,
  };
}

const CLIMBS = [
  climb(1, "Chicken Joe"),
  climb(2, "Rainy Day Dream Away", { type: "trad", grade: 11, areaName: "Campground Wall" }),
  climb(3, "Viaje al Fin del Mundo", { type: "boulder", grade: 11, areaName: "Apron Boulders" }),
  climb(4, "Unnamed Project", { type: "boulder", grade: null, areaName: "Apron Boulders" }),
];

const meta = {
  title: "Components/Import/Missing suggested grades",
  component: ImportMissingGrades,
  decorators: [
    (Story) => (
      <StoryPage title="Review import">
        <Story />
      </StoryPage>
    ),
  ],
  args: { climbs: CLIMBS, useListedGrade: true, onChange: () => {} },
  render: function Render(args) {
    const [useListedGrade, setUseListedGrade] = useState(args.useListedGrade);
    return (
      <ImportMissingGrades {...args} useListedGrade={useListedGrade} onChange={setUseListedGrade} />
    );
  },
} satisfies Meta<typeof ImportMissingGrades>;
export default meta;
type Story = StoryObj<typeof meta>;
export const UseListedGrades: Story = {};
export const LeaveUngraded: Story = { args: { useListedGrade: false } };
export const OneSend: Story = { args: { climbs: CLIMBS.slice(0, 1) } };
