import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { cardClass } from "@/components/ui/card";
import { StoryPage } from "@/stories/fixtures/story-layout";
import { tripSamples } from "@/stories/fixtures/trips";

import type { TripShare } from "./share-trip-dialog";
import { TripHeader } from "./trip-header";

const SHARE: TripShare = {
  token: "4f9c2a7e1b8d6035c9e4a1f7b2d80e36",
  expiresAt: "2099-01-01 00:00:00",
};

const meta = {
  title: "Components/Trips/Trip header",
  component: TripHeader,
  args: {
    trip: tripSamples[1],
    userId: "alex",
    current: "journal",
    share: null,
    shareOrigin: "https://betabook.ca",
    children: (
      <div className={cardClass("fluid")}>
        <p className="text-sm text-muted">The current tab's view sits here.</p>
      </div>
    ),
  },
  decorators: [
    (Story) => (
      <StoryPage title="Trips">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof TripHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The trip's own page: the way back, the dates every tab derives from, and
 * the three views as pills. Not shared, so the header offers Share. */
export const Journal: Story = {};
export const Sends: Story = { args: { current: "sends" } };
export const Analytics: Story = { args: { current: "analytics" } };

/** A single day reads as one date, and no description drops the line. */
export const SingleDay: Story = { args: { trip: tripSamples[2] } };

/** A live link: the chip says when it dies and the button reads Shared. */
export const SharedLive: Story = { args: { share: SHARE } };

/** An expired link reads as no link at all. Judged on the client clock after
 * mount, so the server render never claims an expiry it cannot judge. */
export const SharedExpired: Story = {
  args: { share: { ...SHARE, expiresAt: "2026-04-01 00:00:00" } },
};
