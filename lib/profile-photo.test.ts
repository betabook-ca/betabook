import { expect, it } from "vitest";

import {
  isProfilePhotoKey,
  MAX_PROFILE_PHOTO_BYTES,
  MAX_SOURCE_PHOTO_BYTES,
  SOURCE_PHOTO_TOO_LARGE_MESSAGE,
  sourcePhotoProblem,
  profilePhotoKey,
  profilePhotoKeyFromImage,
  profilePhotoPath,
  PROFILE_PHOTO_TOO_LARGE_MESSAGE,
  PROFILE_PHOTO_UNREADABLE_MESSAGE,
  PROFILE_PHOTO_WRONG_TYPE_MESSAGE,
  profilePhotoProblem,
  sniffImageType,
} from "@/lib/profile-photo";

const digest = (byte: number) => new Uint8Array(32).fill(byte).buffer;
const file = (options: { size: number; type: string }) =>
  new File([new Uint8Array(options.size)], "photo", { type: options.type });

it("keys a photo by a digest of its stored bytes", () => {
  const key = profilePhotoKey("climber1", digest(0xab));
  expect(key).toBe("climber1/abababababababababababababababab.webp");
  expect(isProfilePhotoKey(key)).toBe(true);
});

it("gives different bytes a different key, so no URL changes meaning", () => {
  expect(profilePhotoKey("climber1", digest(0x01))).not.toBe(
    profilePhotoKey("climber1", digest(0x02)),
  );
});

it("round-trips a key through the value stored in user.image", () => {
  const key = profilePhotoKey("climber1", digest(0x7f));
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

it("identifies the formats the transform accepts from the bytes themselves", () => {
  expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe("image/jpeg");
  expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
    "image/png",
  );
  const webp = new Uint8Array(16);
  webp.set([0x52, 0x49, 0x46, 0x46]);
  webp.set([0x57, 0x45, 0x42, 0x50], 8);
  expect(sniffImageType(webp)).toBe("image/webp");
});

it("identifies no format for bytes that only claim to be an image", () => {
  // A HEIC from an iPhone and an SVG both arrive with plausible types; the
  // transform can take neither.
  const heic = new Uint8Array(16);
  heic.set([0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 4);
  expect(sniffImageType(heic)).toBeNull();
  expect(sniffImageType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
  expect(sniffImageType(new Uint8Array())).toBeNull();
});

it("lets the picker open a photo far larger than the upload cap", () => {
  // The picker uploads the cropped square, not this file, so a phone photo
  // that the action would refuse is fine to choose and crop.
  const phonePhoto = file({ size: 9 * 1024 * 1024, type: "image/jpeg" });

  expect(sourcePhotoProblem(phonePhoto)).toBeNull();
  expect(profilePhotoProblem(phonePhoto)).toBe(PROFILE_PHOTO_TOO_LARGE_MESSAGE);
});

it("explains a photo too large for the picker to decode", () => {
  expect(sourcePhotoProblem(file({ size: MAX_SOURCE_PHOTO_BYTES + 1, type: "image/png" }))).toBe(
    SOURCE_PHOTO_TOO_LARGE_MESSAGE,
  );
  expect(sourcePhotoProblem(file({ size: 1024, type: "image/gif" }))).toBe(
    PROFILE_PHOTO_WRONG_TYPE_MESSAGE,
  );
});

it("explains a file the upload cannot accept", () => {
  expect(profilePhotoProblem(file({ size: 1024, type: "image/png" }))).toBeNull();
  expect(profilePhotoProblem(file({ size: 0, type: "image/png" }))).toBe(
    PROFILE_PHOTO_UNREADABLE_MESSAGE,
  );
  expect(profilePhotoProblem(file({ size: MAX_PROFILE_PHOTO_BYTES + 1, type: "image/jpeg" }))).toBe(
    PROFILE_PHOTO_TOO_LARGE_MESSAGE,
  );
  expect(profilePhotoProblem(file({ size: 1024, type: "image/heic" }))).toBe(
    PROFILE_PHOTO_WRONG_TYPE_MESSAGE,
  );
  expect(profilePhotoProblem(file({ size: 1024, type: "" }))).toBe(
    PROFILE_PHOTO_WRONG_TYPE_MESSAGE,
  );
});
