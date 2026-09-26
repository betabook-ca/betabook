import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, mocked, userEvent, waitFor, within } from "storybook/test";

import { uploadProfilePhoto } from "@/actions";
import { SettingsSection } from "@/components/ui/settings";
import { PROFILE_PHOTO_TOO_LARGE_MESSAGE } from "@/lib/profile-photo";
import { drawDemoPhoto } from "@/stories/fixtures/crop-demo";
import { StoryPage } from "@/stories/fixtures/story-layout";

import { ProfilePhotoSettings } from "./profile-photo-settings";

const meta = {
  title: "Components/Account/Profile photo",
  component: ProfilePhotoSettings,
} satisfies Meta<typeof ProfilePhotoSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ image }: React.ComponentProps<typeof ProfilePhotoSettings>) {
  return (
    <StoryPage
      title="Profile photo"
      description="The /account row for uploading a photo. Choosing one opens the cropper; the buttons and wording depend on whether a photo is already showing. The gallery makes no successful request for the example URLs, so avatars elsewhere fall back to initials — this row is about the controls."
    >
      <SettingsSection id="profile" title="Profile">
        <ProfilePhotoSettings image={image} />
      </SettingsSection>
    </StoryPage>
  );
}

/** Nothing stored yet: one Upload photo button and nothing to remove. */
export const NoPhoto: Story = {
  args: { image: null },
  render: (args) => <Example {...args} />,
};

/** An uploaded photo: replace it, or remove it for initials. */
export const Uploaded: Story = {
  args: { image: "/api/avatars/story/abababababababababababababababab.webp" },
  render: (args) => <Example {...args} />,
};

/** A photo Better Auth stored from Google, which an upload replaces. */
export const FromGoogle: Story = {
  args: { image: "https://lh3.googleusercontent.com/a/story-example=s96-c" },
  render: (args) => <Example {...args} />,
};

/** The upload was refused: the cropper stays open and says why, so the
 * climber can re-crop or pick another photo. Reached the way a climber
 * reaches it — choose a photo, frame it, Use photo. */
export const UploadFails: Story = {
  args: { image: null },
  beforeEach: () => {
    mocked(uploadProfilePhoto).mockResolvedValue({
      ok: false,
      error: PROFILE_PHOTO_TOO_LARGE_MESSAGE,
    });
    return () => mocked(uploadProfilePhoto).mockReset();
  },
  render: (args) => <Example {...args} />,
  play: async ({ canvasElement }) => {
    const input = canvasElement.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("No file input rendered");
    await userEvent.upload(input, await drawDemoPhoto(640, 480));
    const page = within(canvasElement.ownerDocument.body);
    const usePhoto = await page.findByRole("button", { name: "Use photo" });
    // Enabled once the cropper has measured the photo.
    await waitFor(() => expect(usePhoto).toBeEnabled(), { timeout: 5000 });
    await userEvent.click(usePhoto);
    await page.findByRole("alert", {}, { timeout: 5000 });
  },
};
