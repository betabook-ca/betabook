import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { JournalEntryRow } from "@/components/journal/journal-entry-row";
import { AppLink } from "@/components/ui/app-link";
import type { JournalEntry } from "@/db/queries";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";

vi.mock("next/cache", () => ({ refresh: () => {}, revalidatePath: () => {} }));

vi.mock("@/components/ui/app-link", () => ({
  AppLink: vi.fn<(props: { children?: ReactNode }) => null>(() => null),
}));

const entry: JournalEntry = {
  id: 1,
  climbId: 2,
  kind: "session",
  sent: false,
  entryDate: "2026-09-04",
  body: "Worked the top move.",
  tags: ["slab"],
  climbName: "Long Mobile Climb Name",
  climbType: "boulder",
  climbGrade: 5,
  climbBrokenOn: null,
  areaId: 3,
  areaName: "Granite Canyon",
  isAscent: false,
  isSendComment: false,
};

function row(filter = DEFAULT_JOURNAL_FILTER, currentEntry = entry) {
  return JournalEntryRow({
    entry: currentEntry,
    isOwner: true,
    userId: "owner",
    filter,
    areaBreadcrumbs: {},
  }) as ReactElement<{
    date: string;
    grade: ReactNode;
    status: ReactNode;
    tags: ReactNode;
  }>;
}

function tagChildren(result: ReturnType<typeof row>) {
  if (!isValidElement<{ children: ReactNode }>(result.props.tags)) return [];
  return flattenNodes(result.props.tags.props.children);
}

function flattenNodes(node: ReactNode): ReactNode[] {
  return Array.isArray(node) ? node.flatMap(flattenNodes) : [node];
}

describe("JournalEntryRow", () => {
  it.each([
    [7, "V6"],
    [0, "VB"],
    [null, "V4"],
  ] as const)("prefers the climber's grade %s, falling back to posted", (reportedGrade, label) => {
    const result = row(DEFAULT_JOURNAL_FILTER, {
      ...entry,
      sent: true,
      isAscent: true,
      reportedGrade,
    });
    expect(renderToStaticMarkup(<>{result.props.grade}</>)).toContain(label);
  });

  it.each([false, true])(
    "omits the grade for an unsent session (retained send comment: %s)",
    (isSendComment) => {
      const result = row(DEFAULT_JOURNAL_FILTER, { ...entry, isSendComment, reportedGrade: 7 });
      expect(renderToStaticMarkup(<>{result.props.grade}</>)).toBe("");
    },
  );

  it.each([false, true])(
    "shows the posted grade on a completed climb (original ascent: %s)",
    (isAscent) => {
      const result = row(DEFAULT_JOURNAL_FILTER, { ...entry, sent: true, isAscent });
      expect(renderToStaticMarkup(<>{result.props.grade}</>)).toContain("V4");
    },
  );

  it("links tag chips to the journal tag filter", () => {
    const result = row();
    const tag = tagChildren(result).find(
      (child) => isValidElement(child) && child.type === AppLink,
    );

    expect(isValidElement<{ href: string }>(tag) && tag.props.href).toBe(
      "/users/owner/journal?tag=slab",
    );
  });

  it("labels a training entry in both its title and right-side status", () => {
    const training = JournalEntryRow({
      entry: {
        ...entry,
        kind: "training",
        climbId: null,
        climbName: null,
        climbType: null,
        climbGrade: null,
        climbBrokenOn: null,
        areaId: null,
        areaName: null,
        tags: [],
      },
      isOwner: false,
      userId: "owner",
      filter: DEFAULT_JOURNAL_FILTER,
      areaBreadcrumbs: {},
    }) as ReactElement<{ title: ReactNode; date: string; status: ReactNode }>;

    expect(training.props.title).toBe("Training");
    expect(training.props.date).toBe("2026-09-04");
    expect(renderToStaticMarkup(<>{training.props.status}</>)).toBe("Training");
    expect(renderToStaticMarkup(training)).not.toContain("·");
  });

  it("lets the active tag chip clear its filter", () => {
    const result = row({ ...DEFAULT_JOURNAL_FILTER, tags: ["slab"] });
    const tag = tagChildren(result).find(
      (child) => isValidElement(child) && child.type === AppLink,
    );

    expect(isValidElement<{ href: string }>(tag) && tag.props.href).toBe("/users/owner/journal");
  });
});
