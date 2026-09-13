import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";

import { StatTileContent } from "@/components/analytics-stat-tiles";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DEFAULT_ANALYTICS_LAYOUT } from "@/lib/analytics-layout";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { AnalyticsWorkspace } from "./analytics-workspace";
const meta = {
  title: "Components/Charts/Analytics workspace",
  component: AnalyticsWorkspace,
  parameters: {
    docs: {
      description: {
        component:
          "The Analytics page title and Customize button share a header; the expanded editor sits below them and above At a glance. Grade pyramid, Breakthroughs, and Flash rate share half-width slots on desktop; time-series charts stay full-width. Customize placeholders use the same background as ordinary stat and chart cards, with a dashed border and a Customize action. While customizing, a floating Save layout action appears after the main save button scrolls above the viewport. At a glance uses six columns from 1280px, so five default stats and Customize share a row. Optional card and chart buttons use a contrasting surface without borders against the muted editor background. The editor uses an auto-fitting grid with readable minimum tile widths, adding columns as space permits.",
      },
    },
  },
} satisfies Meta<typeof AnalyticsWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Customize: Story = {
  args: {
    canCustomize: true,
    cards: [
      {
        id: "sends",
        title: "Sends",
        content: <StatTileContent tile={{ label: "Sends", value: 24 }} />,
      },
      {
        id: "hardest",
        title: "Hardest",
        content: <StatTileContent tile={{ label: "Hardest", value: "V5", sub: "Cedar Arete" }} />,
      },
      {
        id: "days",
        title: "Days out",
        content: <StatTileContent tile={{ label: "Days out", value: 12 }} />,
      },
      {
        id: "firstTry",
        title: "Flash",
        content: <StatTileContent tile={{ label: "Flash", value: "25%" }} />,
      },
      {
        id: "bestYear",
        title: "Best year",
        content: <StatTileContent tile={{ label: "Best year", value: 2025 }} />,
      },
      {
        id: "streak",
        description: "Your longest run of consecutive climbing days.",
        title: "Longest streak",
        content: <StatTileContent tile={{ label: "Longest streak", value: "3 days" }} />,
      },
    ],
    charts: [
      {
        id: "progression",
        title: "Progression",
        content: (
          <div>
            <Eyebrow>Progression</Eyebrow>
            <p className="text-sm text-muted">No dated sends with grades.</p>
          </div>
        ),
      },
      {
        id: "pyramid",
        title: "Grade pyramid",
        content: (
          <div>
            <Eyebrow>Grade pyramid</Eyebrow>
            <p className="text-sm text-muted">No graded sends.</p>
          </div>
        ),
      },
    ],
  },
  render: (args) => (
    <StoryPage
      title="Arrange your analytics"
      description="Customize to drag, reorder, hide, and restore items. Changes stay in this example."
    >
      <AnalyticsWorkspace {...args} />
    </StoryPage>
  ),
};

export const HiddenItems: Story = {
  ...Customize,
  args: {
    ...Customize.args,
    initialLayout: {
      ...DEFAULT_ANALYTICS_LAYOUT,
      cards: ["hardest", "days", "firstTry", "bestYear", "streak"],
      charts: ["progression"],
    },
  },
};

export const EditorOpen: Story = {
  ...Customize,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Customize dashboard" }),
    );
  },
};
export const Visitor: Story = { ...Customize, args: { ...Customize.args, canCustomize: false } };
