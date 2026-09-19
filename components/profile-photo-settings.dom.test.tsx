import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import { uploadProfilePhoto } from "@/actions";
import type { ActionResult } from "@/lib/action-result";
import type { CropSquare } from "@/lib/photo-canvas";
import type { CropArea } from "@/lib/photo-crop";
import { MAX_SOURCE_PHOTO_BYTES, SOURCE_PHOTO_TOO_LARGE_MESSAGE } from "@/lib/profile-photo";

import { ProfilePhotoSettings } from "./profile-photo-settings";

vi.mock("@/actions", () => ({
  uploadProfilePhoto: vi.fn<(data: FormData) => Promise<ActionResult>>(),
  removeProfilePhoto: vi.fn<() => Promise<ActionResult>>(),
}));

// Stands in for the real cropper; see profile-photo-cropper.dom.test.tsx.
// The reported area is a module constant, as the real cropper reports on
// interaction rather than on every render.
vi.mock("react-easy-crop", () => {
  const area: CropArea = { x: 0, y: 0, width: 100, height: 100 };
  return {
    default: ({
      onCropComplete,
    }: {
      onCropComplete?: (percent: CropArea, pixels: CropArea) => void;
    }) => {
      onCropComplete?.(area, area);
      return <div data-testid="cropper" />;
    },
  };
});

const upload = vi.mocked(uploadProfilePhoto);
const CROPPED = new File([new Uint8Array([7, 7, 7])], "profile-photo.webp", {
  type: "image/webp",
});
const cropSquare = vi.fn<CropSquare>(async () => CROPPED);

const GOOGLE_PHOTO = "https://lh3.googleusercontent.com/a/avatar=s96-c";
const UPLOADED_PHOTO = "/api/avatars/climber1/abababababababababababababababab.webp";

const jpeg = (name = "climb.jpg") =>
  new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });

beforeEach(() => {
  upload.mockReset();
  upload.mockResolvedValue({ ok: true, value: undefined });
  cropSquare.mockClear();
  Object.defineProperty(URL, "createObjectURL", { value: () => "blob:photo", writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, writable: true });
});

function setup(image?: string | null) {
  const view = render(<ProfilePhotoSettings image={image} cropSquare={cropSquare} />);
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("No file input rendered");
  return { input, user: userEvent.setup() };
}

it("offers an upload to a climber with no photo, and nothing to remove", () => {
  setup(null);

  expect(screen.getByRole("button", { name: /upload photo/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
});

it("offers to change or remove a photo the climber already has", () => {
  setup(UPLOADED_PHOTO);

  expect(screen.getByRole("button", { name: /change photo/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove photo" })).toBeInTheDocument();
});

it("says where a Google photo came from", () => {
  setup(GOOGLE_PHOTO);

  expect(screen.getByText(/from your google account/i)).toBeInTheDocument();
});

it("crops the chosen photo and uploads the square", async () => {
  const { input, user } = setup(null);

  await user.upload(input, jpeg());

  expect(await screen.findByTestId("cropper")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Use photo" }));

  await waitFor(() => expect(upload).toHaveBeenCalledOnce());
  const submitted = upload.mock.calls[0][0].get("photo");
  expect(submitted).toBeInstanceOf(File);
  expect((submitted as File).type).toBe("image/webp");
  expect(cropSquare).toHaveBeenCalledOnce();
});

it("opens the cropper on a big phone photo, which the crop shrinks anyway", async () => {
  const { input, user } = setup(null);
  const large = jpeg("sunset.jpg");
  Object.defineProperty(large, "size", { value: 9 * 1024 * 1024 });

  await user.upload(input, large);

  expect(await screen.findByTestId("cropper")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("refuses a photo too large to decode, without opening the cropper", async () => {
  const { input, user } = setup(null);
  const enormous = jpeg("panorama.jpg");
  Object.defineProperty(enormous, "size", { value: MAX_SOURCE_PHOTO_BYTES + 1 });

  await user.upload(input, enormous);

  expect(await screen.findByRole("alert")).toHaveTextContent(SOURCE_PHOTO_TOO_LARGE_MESSAGE);
  expect(screen.queryByTestId("cropper")).toBeNull();
  expect(upload).not.toHaveBeenCalled();
});

it("keeps the cropper open and explains a rejected upload", async () => {
  upload.mockResolvedValue({ ok: false, error: "That photo is too large — pick one under 3 MB." });
  const { input, user } = setup(null);

  await user.upload(input, jpeg());
  await user.click(await screen.findByRole("button", { name: "Use photo" }));

  await waitFor(() => expect(upload).toHaveBeenCalledOnce());
  expect(await screen.findByRole("alert")).toHaveTextContent(/too large/i);
  // Still framed, so the climber can re-crop or pick another photo.
  expect(screen.getByTestId("cropper")).toBeInTheDocument();
});

it("reports an upload that never answered", async () => {
  upload.mockRejectedValue(new Error("offline"));
  const { input, user } = setup(null);

  await user.upload(input, jpeg());
  await user.click(await screen.findByRole("button", { name: "Use photo" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/check your connection/i);
});
