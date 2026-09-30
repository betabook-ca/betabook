import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Example, StoryPage } from "@/stories/fixtures/story-layout";

import { SendVideoButton, SendVideoPosters } from "./send-video";

const VIDEOS = {
  youtube: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s",
  short: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  // Real public posts: a lone Instagram video loads Instagram's player, which
  // shows a missing-post message for a made-up link.
  reel: "https://www.instagram.com/reel/DHlf5W0p-g-/",
  post: "https://www.instagram.com/p/C2P_M7rL6e6/",
};

const meta = {
  title: "Components/Sends/Send video",
  component: SendVideoPosters,
  args: { videoUrls: [VIDEOS.youtube], title: "Alex Rivera on Quiet Arete" },
  decorators: [
    (Story) => (
      <StoryPage
        title="Send video"
        description="A send's linked YouTube or Instagram videos. A YouTube video loads only its poster until the viewer presses play. A lone Instagram video loads Instagram's player with the page, because Instagram lets no other site show its cover image. A poster that can't load shows the video's kind instead."
      >
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof SendVideoPosters>;
export default meta;
type Story = StoryObj<typeof meta>;

/** One YouTube video, as the feed shows it: it plays in place. */
export const YouTubeVideo: Story = {};

/** A Short keeps a narrow, tall poster. Instagram's player is as narrow as
 * Instagram allows. */
export const Portrait: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      <Example title="YouTube Short">
        <SendVideoPosters videoUrls={[VIDEOS.short]} title="Alex Rivera on Quiet Arete" />
      </Example>
      <Example title="Instagram reel">
        <SendVideoPosters videoUrls={[VIDEOS.reel]} title="Sam Okafor on Moss Ladder" />
      </Example>
      <Example title="Instagram post">
        <SendVideoPosters videoUrls={[VIDEOS.post]} title="Sam Okafor on Moss Ladder" />
      </Example>
    </div>
  ),
};

/** Several videos on one send: a row of posters that open the dialog, where
 * the viewer pages through them. */
export const SeveralVideos: Story = {
  args: { videoUrls: [VIDEOS.youtube, VIDEOS.reel, VIDEOS.short, VIDEOS.post] },
};

/** The compact control list rows carry; pressing it opens the dialog. */
export const RowButton: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <SendVideoButton
        videoUrls={[VIDEOS.youtube]}
        title="Alex Rivera on Quiet Arete"
        caption="Flash · Sep 1, 2026"
      />
      <SendVideoButton
        videoUrls={[VIDEOS.reel, VIDEOS.youtube, VIDEOS.short]}
        title="Sam Okafor on Moss Ladder"
        caption="Redpoint · Aug 17, 2026"
      />
    </div>
  ),
};
