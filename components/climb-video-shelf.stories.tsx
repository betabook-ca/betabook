import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { ClimbVideo } from "@/db/queries";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ClimbVideoShelf } from "./climb-video-shelf";

const VIDEOS: ClimbVideo[] = [
  {
    videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    userId: "priya",
    userName: "Priya Nair",
    userImage: null,
    ascentStyle: "flash",
    dateSent: "2026-09-06",
  },
  {
    videoUrl: "https://www.instagram.com/reel/C9Xq3uGxJ5R/",
    userId: "sam",
    userName: "Sam Okafor",
    userImage: null,
    ascentStyle: "redpoint",
    dateSent: "2026-08-17",
  },
  // A second video from the same send: one tile each.
  {
    videoUrl: "https://www.instagram.com/p/C9Xq3uGxJ5R/",
    userId: "sam",
    userName: "Sam Okafor",
    userImage: null,
    ascentStyle: "redpoint",
    dateSent: "2026-08-17",
  },
  {
    videoUrl: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    userId: "jordan",
    userName: "Jordan Lee with a much longer display name",
    userImage: null,
    ascentStyle: "redpoint",
    dateSent: null,
  },
];

const meta = {
  title: "Components/Climbs/Climb videos",
  component: ClimbVideoShelf,
  args: { videos: VIDEOS, total: VIDEOS.length, climbName: "Test Highball" },
  decorators: [
    (Story) => (
      <StoryPage
        title="Test Highball"
        description="Videos linked to this climb's sends, above its send list. Each opens in a dialog; the list shows only videos the viewer's audience allows."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof ClimbVideoShelf>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Several: Story = {};
export const One: Story = { args: { videos: VIDEOS.slice(0, 1), total: 1 } };
/** A popular climb shows its newest videos and says how many there are in all. */
export const MoreThanShown: Story = { args: { total: 14 } };
