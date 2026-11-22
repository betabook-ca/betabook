/** Decode a response body as text, stopping once it passes `maxBytes`. The
 * reader is always cancelled on exit, so an oversized or aborted body stops
 * downloading. `onProgress` receives the running byte total after each chunk. */
export async function readTextCapped(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  {
    maxBytes,
    tooLarge,
    signal,
    onProgress,
  }: {
    maxBytes: number;
    tooLarge: () => Error;
    /** Checked after every read, before the chunk is used. */
    signal?: AbortSignal;
    onProgress?: (bytes: number) => void;
  },
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw tooLarge();
      text += decoder.decode(value, { stream: true });
      onProgress?.(bytes);
    }
    text += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text;
}
