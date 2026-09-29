import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { AlbumPhoto } from "@/lib/trip-album";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { TripAlbumPhotos } from "./trip-album";

/** Drawn here, so a story asks nothing of Google. The trailing `#` lets the
 * width the component appends land in the fragment, where it changes nothing. */
function standIn(width: number, height: number, sky: string, rock: string): AlbumPhoto {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${sky}"/><path d="M0 ${height} L${width * 0.3} ${height * 0.35} L${width * 0.55} ${height * 0.6} L${width * 0.8} ${height * 0.25} L${width} ${height * 0.5} L${width} ${height} Z" fill="${rock}"/></svg>`;
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}#`, width, height };
}

const PHOTOS = [
  standIn(4000, 3000, "#a9c7e8", "#8a6f57"),
  standIn(3000, 4000, "#f2c89b", "#5e4a3c"),
  standIn(4000, 2250, "#cfe3d4", "#6b7d5f"),
  standIn(6000, 2000, "#e9b8a0", "#7a5a4a"),
  standIn(3000, 3000, "#b7d0e2", "#9a8570"),
  standIn(2250, 4000, "#dfe7f0", "#4f5b66"),
];

const meta = {
  title: "Components/Trips/Trip album",
  component: TripAlbumPhotos,
  args: { link: "https://photos.app.goo.gl/Example1Album2Link3", photos: PHOTOS },
  decorators: [
    (Story) => (
      <StoryPage title="Trips">
        <Story />
      </StoryPage>
    ),
  ],
} satisfies Meta<typeof TripAlbumPhotos>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Landscape, portrait, wide and square together: the strip's height is
 * fixed and each photo keeps its own shape. */
export const Album: Story = {};

export const OnePhoto: Story = { args: { photos: PHOTOS.slice(0, 1) } };

/** An album that could not be read: unshared since, or a page Google has
 * changed. The link still leads to it. */
export const Unread: Story = { args: { photos: [] } };
