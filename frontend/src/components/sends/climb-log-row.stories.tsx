import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";

import { JournalEntryStatus } from "@/components/journal/journal-entry-layout";
import { SendActionsMenu } from "@/components/sends/send-actions-menu";
import { SendGradeCell } from "@/components/sends/send-grade-cell";
import type { AreaBreadcrumbs } from "@/lib/catalog-types";
import type { UserSendRow } from "@/lib/logbook-types";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbLogRow, UserSendLogRow } from "./climb-log-row";

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
  videos: null,
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

const meta = {
  title: "Components/Journal/Climb log row",
  component: ClimbLogRow,
  args: {
    climb: { id: 2, name: "Cedar Arete", areaId: 3, areaName: "Granite Canyon" },
    areaBreadcrumbs: {},
    grade: <SendGradeCell type="boulder" grade={5} gradeFeel="solid" rating={3} />,
    status: <JournalEntryStatus kind="send" label="Flash" />,
    date: "2026-09-04",
    comment: "A calm finish after a few good attempts.",
    // The owner's row, as in the logbook: a send is edited like any journal entry.
    actions: <SendActionsMenu send={send} />,
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

/** `actions={null}` shows a visitor's view. */
function SendExample({ send: row = send, actions }: { send?: UserSendRow; actions?: ReactNode }) {
  return (
    <UserSendLogRow
      send={row}
      areaBreadcrumbs={breadcrumbs}
      actions={actions === undefined ? <SendActionsMenu send={row} /> : actions}
    />
  );
}

/** As the logbook lists a send: grade cell, ascent style, date and comment
 * all come from the row. */
export const Dated: Story = { render: () => <SendExample /> };

/** A send logged without a date. */
export const Undated: Story = { render: () => <SendExample send={{ ...send, dateSent: null }} /> };

export const NoComment: Story = { render: () => <SendExample send={{ ...send, comment: null }} /> };

/** A send with a video keeps its row height: a Watch button opens the player
 * in a dialog rather than putting a player in the list. */
export const WithVideo: Story = {
  render: () => (
    <SendExample send={{ ...send, videos: ["https://www.youtube.com/shorts/dQw4w9WgXcQ"] }} />
  ),
};

/** Several videos share one button, which counts them. */
export const WithSeveralVideos: Story = {
  render: () => (
    <SendExample
      send={{
        ...send,
        videos: [
          "https://www.youtube.com/shorts/dQw4w9WgXcQ",
          "https://www.instagram.com/reel/C9Xq3uGxJ5R/",
        ],
      }}
    />
  ),
};

/** The climber's own grade sits beside the posted one, with the feel arrow. */
export const SuggestedHarder: Story = {
  render: () => <SendExample send={{ ...send, suggestedGrade: 6, gradeFeel: "high", rating: 4 }} />,
};

/** The owner's row: the pencil ends the status line and opens Edit / Delete. */
export const WithActions: Story = { render: () => <SendExample /> };

/** Someone else's logbook: no edit button. */
export const Visitor: Story = { render: () => <SendExample actions={null} /> };
