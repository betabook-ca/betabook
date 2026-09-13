import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { PublicClimbSend } from "@/lib/public-catalog";
import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { PublicClimbSendList } from "./public-climb-send-list";

function anonymous(dateSent: string | null, send: Partial<PublicClimbSend> = {}): PublicClimbSend {
  return {
    userName: null,
    dateSent,
    ascentStyle: "redpoint",
    rating: 3,
    suggestedGrade: 5,
    gradeFeel: "solid",
    comment: null,
    ...send,
  };
}

const SENDS: PublicClimbSend[] = [
  {
    userName: "Priya Nair",
    dateSent: "2026-09-06",
    ascentStyle: "flash",
    rating: 5,
    suggestedGrade: 5,
    gradeFeel: "solid",
    comment:
      "The left-hand crimp is better than it looks. Commit to the high foot and the top-out is casual.",
  },
  anonymous("2026-09", { ascentStyle: "onsight", rating: 4 }),
  anonymous("2026-08", { suggestedGrade: 6, gradeFeel: "high" }),
  {
    userName: "Sam Okafor",
    dateSent: "2026-08-17",
    ascentStyle: "redpoint",
    rating: 4,
    suggestedGrade: 4,
    gradeFeel: "low",
    comment: "Soft if you are tall. Brush the sloper before every go.",
  },
  anonymous("2026-08", { rating: 5 }),
  anonymous("2026-07", { ascentStyle: "flash" }),
  anonymous("2026-06", { rating: null, suggestedGrade: null }),
  {
    userName: "Jordan Lee",
    dateSent: "2026-05-30",
    ascentStyle: "redpoint",
    rating: 3,
    suggestedGrade: 5,
    gradeFeel: "solid",
    comment: null,
  },
  anonymous("2026-05", { ascentStyle: "onsight" }),
  anonymous(null, { rating: 2 }),
];

const meta = {
  title: "Components/Climbs/Public sends",
  component: PublicClimbSendList,
  args: { type: "boulder", sends: SENDS, next: "/climbs/1/test-highball" },
  decorators: [
    (Story) => (
      <StoryPage
        title="Test Highball"
        description="Signed-out climb page, capped at the latest 10 sends. Rows are anonymous unless the climber shares commentary with Everyone."
      >
        <Example title="Sends">
          <Story />
        </Example>
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof PublicClimbSendList>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MixedAudiences: Story = {};
export const AllAnonymous: Story = {
  args: { sends: SENDS.filter((send) => send.userName === null) },
};
export const FewSends: Story = { args: { sends: SENDS.slice(0, 2) } };
export const NoSends: Story = { args: { sends: [] } };
