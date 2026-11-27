/** Emits one `<script type="application/ld+json">` for structured data.
 * Server-only — the payload is serialized at render and never hydrated.
 *
 * `<` is escaped so a `</script>` sequence inside any string field (a climb
 * name, a description) can't close the tag early. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    // oxlint-disable-next-line react/no-danger -- serialized JSON, not user-authored markup
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  );
}
