import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { JournalEntryLayout, JournalEntryStatus } from "./journal-entry-layout";

it("keeps a dated session readable without reserving space for an absent grade", () => {
  const html = renderToStaticMarkup(
    <JournalEntryLayout
      title="Cedar Arete"
      date="2026-09-04"
      status={<JournalEntryStatus kind="session" />}
    />,
  );
  expect(html).toContain('dateTime="2026-09-04"');
  expect(html).toContain("Session");
  expect(html).not.toContain("—");
});

it("identifies an undated entry", () => {
  const html = renderToStaticMarkup(<JournalEntryLayout title="Cedar Arete" date={null} />);
  expect(html).toContain("Date unknown");
  expect(html).not.toContain("<time");
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

  expect(html).not.toContain("—");
  expect(html).toContain("V4");
  expect(html).toContain("Sent");
});
