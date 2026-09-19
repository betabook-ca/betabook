/** Real image bytes for tests that hand a photo to the upload path. The
 * local Images implementation runs input through an actual decoder, so
 * hand-written "image" bytes are rejected: this module carries one small
 * valid PNG and resizes it through the binding when a test needs particular
 * dimensions. That keeps the repo free of binary fixtures while still
 * exercising the real decode/encode path. */
import { env } from "cloudflare:test";

/** An 8×8 truecolor PNG with a diagonal gradient. */
const SOURCE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAaUlEQVR42gXBgQAAAAgDwcEkE0wOzzCYZAZTd5Io0WKE" +
  "xYqIE1JRRRdTuNgixRVSU00307jZJs010lBDDzN42CHDDZIp02aMzZqYM9JSSy+zeNklyy1SqNBhgsOGhAvSUUcfc/jY" +
  "I8cdDy0IX8ELraphAAAAAElFTkSuQmCC";

/** `Uint8Array<ArrayBuffer>` rather than the default `ArrayBufferLike`: the
 * platform's `BodyInit` and `BlobPart` both exclude a view that might be
 * backed by a `SharedArrayBuffer`. */
type ImageBytes = Uint8Array<ArrayBuffer>;

export function toStream(bytes: ImageBytes): ReadableStream<Uint8Array> {
  return new Response(bytes).body as ReadableStream<Uint8Array>;
}

/** The 8×8 source, for tests that only need valid image bytes. */
function basePngBytes(): ImageBytes {
  return Uint8Array.from(atob(SOURCE_PNG_BASE64), (character) => character.codePointAt(0) ?? 0);
}

/** A valid PNG of exactly these dimensions. Workers tests only — it resizes
 * through the Images binding rather than shipping a fixture per shape. */
async function makePng(width: number, height: number): Promise<ImageBytes> {
  const result = await env.IMAGES.input(toStream(basePngBytes()))
    .transform({ width, height, fit: "cover" })
    .output({ format: "image/png" });
  return new Uint8Array(await new Response(result.image()).arrayBuffer());
}

/** The bytes as a `File`, the shape a form submission carries. */
export async function makePngFile(
  width: number,
  height: number,
  name = "photo.png",
): Promise<File> {
  return new File([await makePng(width, height)], name, { type: "image/png" });
}
