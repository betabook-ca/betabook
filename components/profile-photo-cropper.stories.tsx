import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { CropDemo } from "@/stories/fixtures/crop-demo";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ProfilePhotoCropper } from "./profile-photo-cropper";

const meta = {
  title: "Components/Account/Photo cropper",
  component: ProfilePhotoCropper,
} satisfies Meta<typeof ProfilePhotoCropper>;
export default meta;
type Story = StoryObj<{ width: number; height: number }>;

function Example({ width, height }: { width: number; height: number }) {
  return (
    <StoryPage
      title="Crop your photo"
      description="Framing an uploaded photo as the square that gets stored. The crop window is round because every avatar in the app is. Drag to move, zoom with the slider, and Rotate turns the photo a quarter at a time; the demo photo is drawn on a canvas, and the readout shows what Use photo produced."
    >
      <CropDemo width={width} height={height} />
    </StoryPage>
  );
}

/** A landscape photo: the crop has to choose which part of the width. */
export const Landscape: Story = {
  args: { width: 1200, height: 800 },
  render: (args) => <Example {...args} />,
};

/** A tall photo, the common phone case. */
export const Portrait: Story = {
  args: { width: 720, height: 1280 },
  render: (args) => <Example {...args} />,
};
