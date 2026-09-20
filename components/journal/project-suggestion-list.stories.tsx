import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { OpenProject } from "@/db/queries";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { ProjectSuggestionList } from "./project-suggestion-list";

const meta = {
  title: "Components/Journal/Project suggestions",
  component: ProjectSuggestionList,
} satisfies Meta<typeof ProjectSuggestionList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Climbs with sessions and no send: the rule that used to fill the Projects
 * tab outright, now reduced to a suggestion the climber can accept. */
const suggestions: OpenProject[] = [
  {
    climbId: 201,
    climbName: "Moonlight Arete",
    climbType: "boulder",
    climbGrade: 8,
    climbBrokenOn: null,
    areaId: 11,
    areaName: "Cedar Block",
    sessionCount: 9,
    noteCount: 7,
    firstSession: "2026-04-18",
    lastSession: "2026-09-04",
  },
  {
    climbId: 202,
    climbName: "River Runs Red",
    climbType: "sport",
    climbGrade: 21,
    climbBrokenOn: null,
    areaId: 12,
    areaName: "Granite Amphitheatre",
    sessionCount: 4,
    noteCount: 2,
    firstSession: "2026-05-30",
    lastSession: "2026-07-02",
  },
  {
    climbId: 203,
    climbName: "Ash Crack",
    climbType: "trad",
    climbGrade: 14,
    climbBrokenOn: null,
    areaId: 12,
    areaName: "Granite Amphitheatre",
    sessionCount: 1,
    noteCount: 0,
    firstSession: "2026-08-08",
    lastSession: "2026-08-08",
  },
];

export const Suggestions: Story = {
  args: { suggestions, onPin: () => {}, pendingClimbId: null },
  render: (args) => (
    <StoryPage
      title="Project suggestions"
      description="Offered when the pin search is still empty. The session count is the evidence that a climb is already being projected."
    >
      <Example title="Worked but not sent">
        <ProjectSuggestionList {...args} />
      </Example>
      <Example title="While one is being pinned">
        <ProjectSuggestionList {...args} pendingClimbId={201} />
      </Example>
    </StoryPage>
  ),
};
