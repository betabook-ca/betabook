import type { KayaStreamEvent } from "@/lib/kaya-import-stream";

/** Public KAYA transport fixture shared by adapter and mounted wizard tests. */
export function kayaStreamResponse(items: unknown[], total: number, username = "suzilu") {
  const events: KayaStreamEvent[] = [{ type: "profile", username }];
  for (let offset = 0; offset < Math.max(1, items.length); offset += 100) {
    events.push({ type: "page", items: items.slice(offset, offset + 100), total });
  }
  events.push({ type: "complete", total });
  return new Response(events.map((event) => JSON.stringify(event)).join("\n") + "\n", {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
