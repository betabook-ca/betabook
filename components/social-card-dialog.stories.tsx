import { Button, useOverlayState } from "@heroui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { mocked } from "storybook/test";

import { fetchRecapCoverImage, fetchStatsCardImage } from "@/lib/social-card-fetch";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { SocialCardDialog } from "./social-card-dialog";

/** A tiny solid PNG stands in for the real card: the route renders through
 * `next/og`, which has nothing to run against in a static Storybook preview
 * — same reasoning as the QR code's canvas capture, just for a fetch instead
 * of a paint. */
const PLACEHOLDER_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function placeholderBlob(): Blob {
  const bytes = Uint8Array.from(atob(PLACEHOLDER_PNG), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

const meta = {
  title: "Components/Analytics/Year in review",
  component: SocialCardDialog,
  beforeEach: () => {
    mocked(fetchStatsCardImage).mockImplementation(async () => placeholderBlob());
    mocked(fetchRecapCoverImage).mockImplementation(async () => placeholderBlob());
    return () => {
      mocked(fetchStatsCardImage).mockReset();
      mocked(fetchRecapCoverImage).mockReset();
    };
  },
} satisfies Meta<typeof SocialCardDialog>;
export default meta;

export const Open: StoryObj = {
  render: function Example() {
    const state = useOverlayState({ defaultOpen: true });
    return (
      <StoryPage title="Year in review">
        <Button onPress={state.open}>Year in review</Button>
        <SocialCardDialog
          state={state}
          userId="climber1"
          name="Alex Rivera"
          year={2026}
          linkedRecapAvailable
        />
      </StoryPage>
    );
  },
};
