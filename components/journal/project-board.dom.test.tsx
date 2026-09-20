import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { createJournalEntry, createUndatedSend, updateJournalEntry } from "@/actions";
import type { JournalEntry } from "@/db/queries";

import { ProjectBoard } from "./project-board";
import type { ProjectWithSessions } from "./project-card";

vi.mock("@/actions", () => ({
  createJournalEntry: vi.fn<typeof createJournalEntry>(),
  createUndatedSend: vi.fn<typeof createUndatedSend>(),
  updateJournalEntry: vi.fn<typeof updateJournalEntry>(),
}));

function session(overrides: Partial<JournalEntry> & { id: number }): JournalEntry {
  return {
    climbId: 1,
    kind: "session",
    sent: false,
    entryDate: "2026-09-01",
    body: null,
    tags: [],
    companions: [],
    climbName: "Sample",
    climbType: "boulder",
    climbGrade: 5,
    climbBrokenOn: null,
    areaId: 3,
    areaName: "Sample Block",
    isAscent: false,
    isSendComment: false,
    ...overrides,
  };
}

/** Its whole history fits in what the server preloaded. */
const slab: ProjectWithSessions = {
  climbId: 1,
  climbName: "Moon Slab",
  climbType: "boulder",
  climbGrade: 5,
  climbBrokenOn: null,
  areaId: 3,
  areaName: "Cedar Block",
  sessionCount: 2,
  noteCount: 2,
  firstSession: "2026-08-02",
  lastSession: "2026-09-01",
  sessions: [
    session({
      id: 11,
      entryDate: "2026-09-01",
      body: "Heel slipping off the arete.",
      tags: ["beta"],
    }),
    session({ id: 10, entryDate: "2026-08-02", body: "Linked the bottom half." }),
  ],
};

/** Nine sessions deep, one of them preloaded. */
const crack: ProjectWithSessions = {
  climbId: 2,
  climbName: "Ash Crack",
  climbType: "trad",
  climbGrade: 6,
  climbBrokenOn: null,
  areaId: 4,
  areaName: "Granite Wall",
  sessionCount: 9,
  noteCount: 1,
  firstSession: "2026-01-04",
  lastSession: "2026-07-15",
  sessions: [session({ id: 21, climbId: 2, entryDate: "2026-07-15", body: "Ran out of cams." })],
};

const projects = [slab, crack];

function card(climbName: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: climbName, level: 3 });
  const article = heading.closest("article");
  if (article == null) throw new Error(`No card rendered for ${climbName}`);
  return article;
}

function headings() {
  const list = screen.queryByRole("list", { name: "Open projects" });
  return list
    ? within(list)
        .queryAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    : [];
}

it("explains that only recent projects are shown when the page is capped", () => {
  render(<ProjectBoard userId="climber" projects={projects} hasMore />);

  expect(screen.getByText(/most recently active projects/)).not.toHaveTextContent(/\d/);
});

it("shows every preloaded session on its card", () => {
  render(<ProjectBoard userId="climber" projects={projects} hasMore={false} />);
  const slabCard = card("Moon Slab");

  expect(within(slabCard).getByText("Heel slipping off the arete.")).toBeVisible();
  expect(within(slabCard).getByText("Linked the bottom half.")).toBeVisible();
  expect(within(card("Ash Crack")).getByText("Ran out of cams.")).toBeVisible();
  expect(screen.queryByRole("button", { name: /Show|Hide|Expand/ })).not.toBeInTheDocument();
});

it("offers to page in only the histories longer than the card carries", () => {
  render(<ProjectBoard userId="climber" projects={projects} hasMore={false} />);

  expect(
    within(card("Moon Slab")).queryByRole("button", { name: "Load more" }),
  ).not.toBeInTheDocument();
  expect(within(card("Ash Crack")).getByRole("button", { name: "Load more" })).toBeInTheDocument();
});

it.each([
  ["a climb name", "moon"],
  ["an area", "granite"],
  ["a tag written on a session", "beta"],
  ["the text of a note", "cams"],
])("filters the list by %s", async (_label, needle) => {
  const user = userEvent.setup();
  render(<ProjectBoard userId="climber" projects={projects} hasMore={false} />);

  await user.type(screen.getByRole("searchbox", { name: "Filter projects" }), needle);

  const expected = needle === "moon" || needle === "beta" ? ["Moon Slab"] : ["Ash Crack"];
  expect(headings()).toEqual(expected);
});

it("says so when nothing matches, and restores the list when the search is cleared", async () => {
  const user = userEvent.setup();
  render(<ProjectBoard userId="climber" projects={projects} hasMore={false} />);
  const search = screen.getByRole("searchbox", { name: "Filter projects" });

  await user.type(search, "kneebar");

  expect(headings()).toEqual([]);
  expect(screen.getByText("No open projects match this search.")).toBeInTheDocument();

  await user.clear(search);

  expect(headings()).toEqual(["Moon Slab", "Ash Crack"]);
});

it("reorders the list without dropping a project", async () => {
  const user = userEvent.setup();
  render(<ProjectBoard userId="climber" projects={projects} hasMore={false} />);

  expect(headings()).toEqual(["Moon Slab", "Ash Crack"]);

  await user.click(screen.getByRole("button", { name: /Sort projects/ }));
  await user.click(await screen.findByRole("option", { name: "Most sessions" }));

  expect(headings()).toEqual(["Ash Crack", "Moon Slab"]);

  await user.click(screen.getByRole("button", { name: /Sort projects/ }));
  await user.click(await screen.findByRole("option", { name: "Longest running" }));

  expect(headings()).toEqual(["Ash Crack", "Moon Slab"]);
});

it("logs a session against the project whose button was pressed", async () => {
  const user = userEvent.setup();
  render(<ProjectBoard userId="climber" projects={projects} hasMore={false} />);

  await user.click(screen.getByRole("button", { name: "Log a session on Ash Crack" }));

  const drawer = await screen.findByRole("dialog");
  expect(within(drawer).getByText("Ash Crack")).toBeInTheDocument();

  vi.mocked(createJournalEntry).mockResolvedValue({ ok: true, value: undefined });
  await user.click(within(drawer).getByRole("button", { name: "Save entry" }));

  await waitFor(() => expect(createJournalEntry).toHaveBeenCalledTimes(1));
  expect(vi.mocked(createJournalEntry).mock.calls[0][0].get("climbId")).toBe("2");
});

it("invites a first session when there are no open projects", () => {
  render(<ProjectBoard userId="climber" projects={[]} hasMore={false} />);

  expect(
    screen.getByText(/No open projects\. Log a session on a climb you haven't sent/),
  ).toBeInTheDocument();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
});
