import { apiFetch } from "@/lib/api-client";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/sends-import";
import { importCsvFallback, importTooLargeMessage } from "@/lib/support";

async function responseError(response: Response) {
  const result: unknown = await response.json();
  const error = result && typeof result === "object" && "error" in result ? result.error : null;
  return new Error(
    typeof error === "string" ? error : "Couldn't load sends from KAYA. Please try again.",
  );
}

/** Consume bounded NDJSON frames; heartbeats reset the inactivity timeout while
 * KAYA asks us to wait. A cancelled reader closes the server's upstream work. */
export async function readKayaStream(
  username: string,
  climbTypeId: string,
  signal: AbortSignal,
  onMessage: (value: unknown) => void,
) {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  let timeout = setTimeout(cancel, 45_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancelReader = () => {
    void reader?.cancel().catch(() => {});
  };
  controller.signal.addEventListener("abort", cancelReader, { once: true });
  try {
    const params = new URLSearchParams({ username, climbTypeId });
    const response = await apiFetch(`/api/import/kaya?${params}`, {
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) throw await responseError(response);
    if (!response.body || !response.headers.get("Content-Type")?.includes("application/x-ndjson"))
      throw new Error("KAYA returned an unexpected response. Please try again.");
    reader = response.body.getReader();
    controller.signal.throwIfAborted();
    const decoder = new TextDecoder();
    let buffer = "";
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      controller.signal.throwIfAborted();
      if (done) break;
      clearTimeout(timeout);
      timeout = setTimeout(cancel, 45_000);
      bytes += value.byteLength;
      if (bytes > MAX_IMPORT_FILE_BYTES + 1024 * 1024)
        throw new Error(
          importTooLargeMessage("KAYA history", importCsvFallback("KAYA", "logbook")),
        );
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.length > 1024 * 1024) throw new Error("KAYA returned an unexpected response.");
        if (line.trim()) onMessage(JSON.parse(line));
      }
      if (buffer.length > 1024 * 1024) throw new Error("KAYA returned an unexpected response.");
    }
    buffer += decoder.decode();
    if (buffer.trim()) throw new Error("The KAYA download was interrupted. Please try again.");
  } catch (error) {
    signal.throwIfAborted();
    if (controller.signal.aborted)
      throw new Error("KAYA stopped responding. Please try again.", { cause: error });
    if (error instanceof TypeError || error instanceof SyntaxError)
      throw new Error("The KAYA download was interrupted. Please try again.", { cause: error });
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", cancelReader);
    await reader?.cancel().catch(() => {});
  }
}
