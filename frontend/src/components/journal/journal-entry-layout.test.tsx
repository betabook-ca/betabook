import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { JournalEntryLayout, JournalEntryStatus } from "./journal-entry-layout";

const PLACEHOLDER = '<span class="text-muted">—</span>';

function placeholders(html: string) {
  return html.split(PLACEHOLDER).length - 1;
}

it("marks an ungraded session's empty grade slot with a muted dash above its status", () => {
  const html = renderToStaticMarkup(
    <JournalEntryLayout
      title="Cedar Arete"
      date="2026-09-04"
      status={<JournalEntryStatus kind="session" />}
    />,
  );

  expect(placeholders(html)).toBe(1);
  expect(html.indexOf(PLACEHOLDER)).toBeLessThan(html.indexOf("Session"));
});

it("marks both empty slots of a training entry", () => {
  const html = renderToStaticMarkup(<JournalEntryLayout title="Training" date="2026-09-04" />);

  expect(placeholders(html)).toBe(2);
});

it("shows the grade and status instead of the dash when the entry has them", () => {
  const html = renderToStaticMarkup(
    <JournalEntryLayout
      title="Cedar Arete"
      date="2026-09-04"
      grade="V4"
      status={<JournalEntryStatus kind="send" />}
    />,
  );

  expect(placeholders(html)).toBe(0);
  expect(html).toContain("V4");
  expect(html).toContain("Sent");
});
