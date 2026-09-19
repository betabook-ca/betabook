import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import type { CropSquare } from "@/lib/photo-canvas";
import type { CropArea } from "@/lib/photo-crop";

import { CROP_FAILED_MESSAGE, ProfilePhotoCropper } from "./profile-photo-cropper";

/** react-easy-crop measures its container and decodes the photo, neither of
 * which jsdom does — so it stands in here, reporting a fixed crop and
 * echoing the props this component drives it with. The real cropper's drag,
 * zoom and round window are covered by tests/ui/profile-photo-cropper.spec.ts. */
const REPORTED_AREA: CropArea = { x: 12, y: 34, width: 200, height: 200 };

vi.mock("react-easy-crop", () => ({
  default: ({
    zoom,
    rotation,
    cropShape,
    aspect,
    onCropComplete,
  }: {
    zoom: number;
    rotation: number;
    cropShape: string;
    aspect: number;
    onCropComplete?: (percent: CropArea, pixels: CropArea) => void;
  }) => {
    onCropComplete?.(REPORTED_AREA, REPORTED_AREA);
    return (
      <div
        data-testid="cropper"
        data-zoom={String(zoom)}
        data-rotation={String(rotation)}
        data-crop-shape={cropShape}
        data-aspect={String(aspect)}
      />
    );
  },
}));

const photo = () => new File([new Uint8Array([1, 2, 3])], "climb.jpg", { type: "image/jpeg" });

function overlayState(isOpen = true) {
  return {
    isOpen,
    setOpen: vi.fn<(open: boolean) => void>(),
    open: vi.fn<() => void>(),
    close: vi.fn<() => void>(),
    toggle: vi.fn<() => void>(),
  } as unknown as Parameters<typeof ProfilePhotoCropper>[0]["state"];
}

const onCroppedMock = () => vi.fn<(photo: File) => void>();

beforeEach(() => {
  // jsdom has no blob URLs; the component only needs a string to hand over.
  Object.defineProperty(URL, "createObjectURL", { value: () => "blob:photo", writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, writable: true });
});

const cropper = () => screen.getByTestId("cropper");

it("frames a square with a round window, as the avatar will render it", async () => {
  render(
    <ProfilePhotoCropper
      file={photo()}
      state={overlayState()}
      onCropped={onCroppedMock()}
      isPending={false}
    />,
  );

  await waitFor(() => expect(cropper()).toBeInTheDocument());
  expect(cropper()).toHaveAttribute("data-aspect", "1");
  expect(cropper()).toHaveAttribute("data-crop-shape", "round");
});

it("hands over the square the cropper reported, at the chosen rotation", async () => {
  const user = userEvent.setup();
  const cropSquare = vi.fn<CropSquare>(async () => photo());
  const onCropped = onCroppedMock();
  render(
    <ProfilePhotoCropper
      file={photo()}
      state={overlayState()}
      onCropped={onCropped}
      isPending={false}
      cropSquare={cropSquare}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Rotate" }));
  expect(cropper()).toHaveAttribute("data-rotation", "90");

  await user.click(screen.getByRole("button", { name: "Use photo" }));

  await waitFor(() => expect(cropSquare).toHaveBeenCalledOnce());
  expect(cropSquare.mock.calls[0][1]).toEqual(REPORTED_AREA);
  expect(cropSquare.mock.calls[0][2]).toBe(90);
  await waitFor(() => expect(onCropped).toHaveBeenCalledOnce());
});

it("turns a full circle back to upright", async () => {
  const user = userEvent.setup();
  render(
    <ProfilePhotoCropper
      file={photo()}
      state={overlayState()}
      onCropped={onCroppedMock()}
      isPending={false}
    />,
  );

  const rotate = screen.getByRole("button", { name: "Rotate" });
  for (const expected of ["90", "180", "270", "0"]) {
    await user.click(rotate);
    expect(cropper()).toHaveAttribute("data-rotation", expected);
  }
});

it("zooms the photo from the slider", async () => {
  const user = userEvent.setup();
  render(
    <ProfilePhotoCropper
      file={photo()}
      state={overlayState()}
      onCropped={onCroppedMock()}
      isPending={false}
    />,
  );

  expect(cropper()).toHaveAttribute("data-zoom", "1");
  const slider = screen.getByRole("slider", { name: /zoom/i });
  slider.focus();
  await user.keyboard("{ArrowRight}{ArrowRight}");

  await waitFor(() => expect(cropper()).not.toHaveAttribute("data-zoom", "1"));
});

it("crops once however often Use photo is pressed", async () => {
  const user = userEvent.setup();
  // Encoding runs before the upload starts, so nothing else disables the
  // button in that window — a second press would otherwise start a second
  // crop and, once both finish, a second upload.
  let release: (photo: File) => void = () => {};
  const cropSquare = vi.fn<CropSquare>(
    () =>
      new Promise<File>((resolve) => {
        release = resolve;
      }),
  );
  const onCropped = onCroppedMock();
  render(
    <ProfilePhotoCropper
      file={photo()}
      state={overlayState()}
      onCropped={onCropped}
      isPending={false}
      cropSquare={cropSquare}
    />,
  );

  const use = screen.getByRole("button", { name: "Use photo" });
  await user.click(use);
  await waitFor(() => expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled());
  await user.click(screen.getByRole("button", { name: "Saving…" }));

  expect(cropSquare).toHaveBeenCalledOnce();
  release(photo());
  await waitFor(() => expect(onCropped).toHaveBeenCalledOnce());
});

it("explains a failed crop and uploads nothing", async () => {
  const user = userEvent.setup();
  const onCropped = onCroppedMock();
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <ProfilePhotoCropper
      file={photo()}
      state={overlayState()}
      onCropped={onCropped}
      isPending={false}
      cropSquare={() => Promise.reject(new Error("no canvas"))}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Use photo" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(CROP_FAILED_MESSAGE);
  expect(onCropped).not.toHaveBeenCalled();
  logged.mockRestore();
});

it("shows the upload's own failure against the photo that caused it", async () => {
  render(
    <ProfilePhotoCropper
      file={photo()}
      state={overlayState()}
      onCropped={onCroppedMock()}
      isPending={false}
      error="That's a lot of photos at once — try again in a minute."
    />,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(/lot of photos at once/i);
});

it("blocks a second submission while one is saving", async () => {
  render(
    <ProfilePhotoCropper
      file={photo()}
      state={overlayState()}
      onCropped={onCroppedMock()}
      isPending
    />,
  );

  expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
});
