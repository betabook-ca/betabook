import { logClientError, parseClientErrorReport } from "@/lib/error-reporting";
import { allowClientErrorReport } from "@/lib/rate-limit";

/** A report is a few short strings; anything larger was not sent by the
 * error boundary. */
const MAX_BODY_BYTES = 4096;

/** The body as text, or null once it passes `max` bytes. A declared length
 * over the cap is refused before reading, and an undeclared or false one is
 * cut off as the stream passes it, so an oversized request is never buffered
 * whole. Bytes, not characters: 4,096 "é" are 8,192 bytes. */
async function readCappedText(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- a stream is read one chunk at a time
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Receives the beacon `reportClientError` sends when a browser shows an error
 * page, so it leaves an error-level log line even when the server logged
 * nothing. Best-effort: a rate-limited or failed report is not logged, so
 * counts are a floor. No session: a signed-out page can fail too. The origin
 * check and the per-address limit keep other sites and scripts out of the
 * logs. */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await allowClientErrorReport(ip))) return new Response(null, { status: 429 });

  const text = await readCappedText(request, MAX_BODY_BYTES);
  if (text === null) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const report = parseClientErrorReport(body);
  if (!report) return new Response(null, { status: 400 });
  logClientError(report);
  return new Response(null, { status: 204 });
}
