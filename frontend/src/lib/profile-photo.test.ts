import { expect, it } from "vitest";

import {
  isProfilePhotoKey,
  MAX_SOURCE_PHOTO_BYTES,
  SOURCE_PHOTO_TOO_LARGE_MESSAGE,
  sourcePhotoProblem,
  profilePhotoKeyFromImage,
  profilePhotoPath,
  PROFILE_PHOTO_WRONG_TYPE_MESSAGE,
} from "@/lib/profile-photo";

const file = (options: { size: number; type: string }) =>
  new File([new Uint8Array(options.size)], "photo", { type: options.type });

it("round-trips a key through the value stored in user.image", () => {
  const key = "climber1/0123456789abcdef0123456789abcdef.webp";
  const image = profilePhotoPath(key);
  expect(image).toBe(`/api/avatars/${key}`);
  expect(profilePhotoKeyFromImage(image)).toBe(key);
});

it("claims no key for a photo this app did not store", () => {
  expect(profilePhotoKeyFromImage("https://lh3.googleusercontent.com/a/abc=s96-c")).toBeNull();
  expect(profilePhotoKeyFromImage(null)).toBeNull();
  expect(profilePhotoKeyFromImage("")).toBeNull();
  expect(profilePhotoKeyFromImage("/api/avatars/")).toBeNull();
});

it("rejects keys that are not one climber's WebP object", () => {
  // Traversal, a foreign prefix, a wrong extension and a short digest: the
  // serving route builds its key from URL segments, so these must never
  // reach the bucket.
  const rejected = [
    "../catalog/latest.json",
    "climber1/../../secret.webp",
    "climber1/abababababababababababababababab.json",
    "climber1/abab.webp",
    "climber1/ABABABABABABABABABABABABABABABAB.webp",
    "climber1/abababababababababababababababab.webp/extra",
    "abababababababababababababababab.webp",
  ];
  expect(rejected.filter((key) => isProfilePhotoKey(key))).toEqual([]);

  expect(profilePhotoKeyFromImage("/api/avatars/climber1/../../secret.webp")).toBeNull();
});

it("lets the picker open a photo far larger than the upload cap", () => {
  // The picker uploads the cropped square, not this file, so a phone photo
  // that the action would refuse is fine to choose and crop.
  const phonePhoto = file({ size: 9 * 1024 * 1024, type: "image/jpeg" });

  expect(sourcePhotoProblem(phonePhoto)).toBeNull();
});

it("explains a photo too large for the picker to decode", () => {
  expect(sourcePhotoProblem(file({ size: MAX_SOURCE_PHOTO_BYTES + 1, type: "image/png" }))).toBe(
    SOURCE_PHOTO_TOO_LARGE_MESSAGE,
  );
  expect(sourcePhotoProblem(file({ size: 1024, type: "image/gif" }))).toBe(
    PROFILE_PHOTO_WRONG_TYPE_MESSAGE,
  );
});
