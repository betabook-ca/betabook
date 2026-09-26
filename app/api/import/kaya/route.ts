import { ActionError } from "@/lib/action-result";
import { withApiSession } from "@/lib/api-session";
import { fetchKayaAscents } from "@/lib/kaya-api";
import type { KayaStreamEvent } from "@/lib/kaya-import-stream";
import { parseKayaUsername } from "@/lib/kaya-profile";
import { importCsvFallback } from "@/lib/support";

const headers = { "Cache-Control": "private, no-store, no-transform" };
const handleImport = withApiSession(async (_session, request: Request) => {
  const params = new URL(request.url).searchParams;
  let username: string;
  const climbTypeId = params.get("climbTypeId") ?? "";
  try {
    username = parseKayaUsername(params.get("username"));
    if (!["1", "2"].includes(climbTypeId)) throw new Error("Invalid KAYA discipline.");
  } catch {
    return Response.json(
      { error: "Enter a valid KAYA profile and outdoor discipline." },
      { status: 400, headers },
    );
  }
  const controller = new AbortController();
  const cancelRequest = () => controller.abort();
  request.signal.addEventListener("abort", cancelRequest, { once: true });
  if (request.signal.aborted) cancelRequest();
  const timeout = setTimeout(
    () =>
      controller.abort(
        new ActionError(
          `This KAYA import is taking too long. Try again later. ${importCsvFallback("KAYA", "logbook")}`,
        ),
      ),
    10 * 60_000,
  );
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const cleanup = () => {
    clearTimeout(timeout);
    clearInterval(heartbeat);
    request.signal.removeEventListener("abort", cancelRequest);
  };
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      const encoder = new TextEncoder();
      const emit = (event: KayaStreamEvent) => {
        if (!closed) stream.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      emit({ type: "heartbeat" });
      heartbeat = setInterval(() => emit({ type: "heartbeat" }), 15_000);
      void (async () => {
        try {
          const result = await fetchKayaAscents({ username, climbTypeId }, controller.signal, emit);
          emit({ type: "complete", total: result.total });
        } catch (error) {
          emit({
            type: "error",
            error:
              error instanceof ActionError
                ? error.message
                : "Couldn't load sends from KAYA. Please try again.",
          });
        } finally {
          cleanup();
          if (!closed) {
            closed = true;
            stream.close();
          }
        }
      })();
    },
    cancel() {
      closed = true;
      controller.abort();
      cleanup();
    },
  });
  return new Response(body, { headers: { ...headers, "Content-Type": "application/x-ndjson" } });
});

export async function GET(request: Request) {
  const response = await handleImport(request);
  // Keep the shared auth/error contract, and prevent response transformation
  // from buffering streamed progress while KAYA is paging or backing off.
  if (response.headers.get("Content-Type") === "application/x-ndjson") {
    response.headers.set("Cache-Control", headers["Cache-Control"]);
  }
  return response;
}
