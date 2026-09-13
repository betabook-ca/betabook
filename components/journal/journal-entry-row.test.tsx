import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { JournalEntryRow } from "@/components/journal/journal-entry-row";
import { AppLink } from "@/components/ui/app-link";
import type { JournalEntry } from "@/db/queries";
import { DEFAULT_JOURNAL_FILTER } from "@/lib/filters/journal-filter";

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
    areaBreadcrumbs: Record<number, { id: number; name: string }[]>;
    climb: { id: number; name: string; areaId: number; areaName: string };
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
  it("links tag chips to the journal tag filter", () => {
    const result = row();
    const tag = tagChildren(result).find(
      (child) => isValidElement(child) && child.type === AppLink,
    );

    expect(isValidElement<{ href: string }>(tag) && tag.props.href).toBe(
      "/users/owner/journal?tag=slab",
    );
  });

  it("names a training entry once, in its title, without a status pill", () => {
    const training = JournalEntryRow({
      entry: {
        ...entry,
        kind: "training",
        climbId: null,
        climbName: null,
        climbType: null,
        climbGrade: null,
        areaId: null,
        areaName: null,
        tags: [],
      },
      isOwner: false,
      userId: "owner",
      filter: DEFAULT_JOURNAL_FILTER,
      areaBreadcrumbs: {},
    }) as ReactElement<{ title: ReactNode; trailing: ReactNode }>;

    expect(training.props.title).toBe("Training");
    const trailing = renderToStaticMarkup(<>{training.props.trailing}</>);
    expect(trailing).toMatch(/datetime="2026-09-04"/i);
    expect(trailing).not.toContain("Training");
  });

  it("lets the active tag chip clear its filter", () => {
    const result = row({ ...DEFAULT_JOURNAL_FILTER, tags: ["slab"] });
    const tag = tagChildren(result).find(
      (child) => isValidElement(child) && child.type === AppLink,
    );

    expect(isValidElement<{ href: string }>(tag) && tag.props.href).toBe("/users/owner/journal");
  });
});
