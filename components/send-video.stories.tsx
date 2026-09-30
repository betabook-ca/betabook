import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { SendVideoButton, SendVideoPoster } from "./send-video";

const VIDEOS = {
  youtube: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s",
  short: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  reel: "https://www.instagram.com/reel/C9Xq3uGxJ5R/",
  post: "https://www.instagram.com/p/C9Xq3uGxJ5R/",
};

const meta = {
  title: "Components/Sends/Send video",
  component: SendVideoPoster,
  args: { videoUrl: VIDEOS.youtube, title: "Alex Rivera on Quiet Arete" },
  decorators: [
    (Story) => (
      <StoryPage
        title="Send video"
        description="A send's linked YouTube or Instagram video. Nothing plays, and nothing but a YouTube poster loads, until the viewer presses play. A poster that can't load shows the video's kind instead."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof SendVideoPoster>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A YouTube video, as the feed shows it. */
export const YouTubeVideo: Story = {};

/** Portrait clips keep a narrow, tall frame. */
export const Portrait: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      <Example title="YouTube Short">
        <SendVideoPoster videoUrl={VIDEOS.short} title="Alex Rivera on Quiet Arete" />
      </Example>
      <Example title="Instagram reel">
        <SendVideoPoster videoUrl={VIDEOS.reel} title="Sam Okafor on Moss Ladder" />
      </Example>
      <Example title="Instagram post">
        <SendVideoPoster videoUrl={VIDEOS.post} title="Sam Okafor on Moss Ladder" />
      </Example>
    </div>
  ),
};

/** The compact control list rows carry; pressing it opens the player in a dialog. */
export const RowButton: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <SendVideoButton
        videoUrl={VIDEOS.youtube}
        title="Alex Rivera on Quiet Arete"
        caption="Flash · Sep 1, 2026"
      />
      <SendVideoButton videoUrl={VIDEOS.reel} title="Sam Okafor on Moss Ladder" />
    </div>
  ),
};
