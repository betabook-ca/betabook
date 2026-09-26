import { Menu } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";

import { AscentStyle } from "@/components/ascent-style";
import { SendGradeCell } from "@/components/send-grade-cell";
import { ActionsMenu } from "@/components/ui/actions-menu";
import type { AreaBreadcrumbs, UserSendRow } from "@/db/queries";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbLogRow, UserSendLogRow } from "./climb-log-row";

const meta = {
  title: "Components/Journal/Climb log row",
  component: ClimbLogRow,
  args: {
    climb: { id: 2, name: "Cedar Arete", areaId: 3, areaName: "Granite Canyon" },
    areaBreadcrumbs: {},
    grade: <SendGradeCell type="boulder" grade={5} gradeFeel="solid" rating={3} />,
    status: <AscentStyle type="flash" />,
    date: "2026-09-04",
    comment: "A calm finish after a few good attempts.",
  },
  decorators: [
    (Story) => (
      <StoryPage title="Sends">
        <div data-climb-log-example>
          <Story />
        </div>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ClimbLogRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The generic row with hand-built cells: the layout reference. */
export const Sent: Story = {};

/** One send as the sends query returns it; the logbook derives every cell from this. */
const send: UserSendRow = {
  id: 1,
  climbId: 2,
  climbName: "Cedar Arete",
  climbType: "boulder",
  climbGrade: 5,
  areaId: 3,
  areaName: "Granite Canyon",
  ascentStyle: "flash",
  dateSent: "2026-09-04",
  rating: 3,
  suggestedGrade: 5,
  gradeFeel: "solid",
  comment: "A calm finish after a few good attempts.",
};
const breadcrumbs: AreaBreadcrumbs = {
  3: [
    { id: 1, name: "Sierra Nevada" },
    { id: 2, name: "Bishop" },
  ],
};

function SendExample({ send: row = send, actions }: { send?: UserSendRow; actions?: ReactNode }) {
  return <UserSendLogRow send={row} areaBreadcrumbs={breadcrumbs} actions={actions} />;
}

/** As the logbook lists a send: grade cell, ascent style, date and comment
 * all come from the row. */
export const Dated: Story = { render: () => <SendExample /> };

/** A send logged without a date. */
export const Undated: Story = { render: () => <SendExample send={{ ...send, dateSent: null }} /> };

export const NoComment: Story = { render: () => <SendExample send={{ ...send, comment: null }} /> };

/** The climber's own grade sits beside the posted one, with the feel arrow. */
export const SuggestedHarder: Story = {
  render: () => <SendExample send={{ ...send, suggestedGrade: 6, gradeFeel: "high", rating: 4 }} />,
};

/** The owner's row carries the actions menu. The sample menu does nothing. */
export const WithActions: Story = {
  render: () => (
    <SendExample
      actions={
        <ActionsMenu ariaLabel="Send actions" onAction={() => {}}>
          <Menu.Item id="edit">Edit</Menu.Item>
          <Menu.Item id="delete">Delete</Menu.Item>
        </ActionsMenu>
      }
    />
  ),
};
