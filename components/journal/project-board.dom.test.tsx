import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { createJournalEntry, createUndatedSend, unpinProject, updateJournalEntry } from "@/actions";
import type { JournalEntry } from "@/db/queries";

import { ProjectBoard } from "./project-board";
import type { ProjectWithSessions } from "./project-card";

vi.mock("@/actions", () => ({
  createJournalEntry: vi.fn<typeof createJournalEntry>(),
  createUndatedSend: vi.fn<typeof createUndatedSend>(),
  updateJournalEntry: vi.fn<typeof updateJournalEntry>(),
  unpinProject: vi.fn<typeof unpinProject>(),
  pinProject: vi.fn<() => Promise<never>>(),
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
  pinnedAt: "2026-08-02",
  firstSession: "2026-08-02",
  lastSession: "2026-09-01",
  sentOn: null,
  sent: false,
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
  pinnedAt: "2026-01-04",
  firstSession: "2026-01-04",
  lastSession: "2026-07-15",
  sentOn: null,
  sent: false,
  sessions: [session({ id: 21, climbId: 2, entryDate: "2026-07-15", body: "Ran out of cams." })],
};

/** Pinned off a guidebook and never touched: no sessions, so no dates to sort
 * or print. The board has to survive it and the card has to say so. */
const untouched: ProjectWithSessions = {
  climbId: 3,
  climbName: "Sleeping Giant",
  climbType: "boulder",
  climbGrade: 10,
  climbBrokenOn: null,
  areaId: 3,
  areaName: "Cedar Block",
  sessionCount: 0,
  noteCount: 0,
  pinnedAt: "2026-09-10",
  firstSession: null,
  lastSession: null,
  sentOn: null,
  sent: false,
  sessions: [],
};

const sentProject: ProjectWithSessions = {
  ...crack,
  climbId: 4,
  climbName: "Long Winter",
  sentOn: "2026-08-15",
  sent: true,
};

const projects = [slab, crack];

function card(climbName: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: climbName, level: 3 });
  const article = heading.closest("article");
  if (article == null) throw new Error(`No card rendered for ${climbName}`);
  return article;
}

function headings(label = "Open projects") {
  const list = screen.queryByRole("list", { name: label });
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
  expect(screen.getByText("No projects match this search.")).toBeInTheDocument();

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

it("keeps a never-climbed project in the list under every sort, behind the active ones", async () => {
  const user = userEvent.setup();
  render(<ProjectBoard userId="climber" projects={[untouched, ...projects]} hasMore={false} />);

  // Recent activity: it has none, so it sorts last rather than first or out.
  expect(headings()).toEqual(["Moon Slab", "Ash Crack", "Sleeping Giant"]);

  for (const sort of ["Most sessions", "Longest running", "Recently tracked", "Name"]) {
    await user.click(screen.getByRole("button", { name: /Sort projects/ }));
    await user.click(await screen.findByRole("option", { name: sort }));
    expect(headings()).toHaveLength(3);
    expect(headings()).toContain("Sleeping Giant");
  }
});

it("renders a tracked climb with no sessions as a bare card, with no dates to report", () => {
  render(<ProjectBoard userId="climber" projects={[untouched]} hasMore={false} />);
  const bare = card("Sleeping Giant");

  expect(within(bare).getByText("No sessions yet")).toBeVisible();
  expect(within(bare).getByText(/Tracked/)).toBeVisible();
  expect(within(bare).queryByText(/^Last/)).not.toBeInTheDocument();
  expect(within(bare).queryByText(/^Since/)).not.toBeInTheDocument();
  // Nothing to page through, and still loggable — that is the point of pinning
  // a climb before touching it.
  expect(within(bare).queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  expect(
    within(bare).getByRole("button", { name: "Log a session on Sleeping Giant" }),
  ).toBeInTheDocument();
});

it("logs a session against the project whose button was pressed", async () => {
  const user = userEvent.setup();
  render(<ProjectBoard userId="climber" projects={projects} hasMore={false} />);

  await user.click(screen.getByRole("button", { name: "Log a session on Ash Crack" }));

  const drawer = await screen.findByRole("dialog");
  expect(within(drawer).getByText("Logging an outdoor session on Ash Crack.")).toBeInTheDocument();

  vi.mocked(createJournalEntry).mockResolvedValue({ ok: true, value: undefined });
  await user.click(within(drawer).getByRole("button", { name: "Save entry" }));

  await waitFor(() => expect(createJournalEntry).toHaveBeenCalledTimes(1));
  expect(vi.mocked(createJournalEntry).mock.calls[0][0].get("climbId")).toBe("2");
});

it("untracks the project whose button was pressed", async () => {
  const user = userEvent.setup();
  vi.mocked(unpinProject).mockResolvedValue({ ok: true, value: undefined });
  render(<ProjectBoard userId="climber" projects={projects} hasMore={false} />);

  await user.click(screen.getByRole("button", { name: "Untrack Ash Crack" }));

  await waitFor(() => expect(unpinProject).toHaveBeenCalledWith(2));
  expect(unpinProject).toHaveBeenCalledTimes(1);
});

it("keeps a failed untrack on screen with its reason", async () => {
  const user = userEvent.setup();
  vi.mocked(unpinProject).mockResolvedValue({ ok: false, error: "Climb not found" });
  render(<ProjectBoard userId="climber" projects={projects} hasMore={false} />);

  await user.click(screen.getByRole("button", { name: "Untrack Ash Crack" }));

  expect(await within(card("Ash Crack")).findByText("Climb not found")).toBeVisible();
  expect(headings()).toEqual(["Moon Slab", "Ash Crack"]);
});

it("keeps the whole toolbar on an empty board and puts the message under it", () => {
  render(<ProjectBoard userId="climber" projects={[]} hasMore={false} />);

  // Same row as a populated board, so the pin control does not jump once the
  // climber makes their first pin.
  expect(screen.getByRole("searchbox", { name: "Filter projects" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Sort projects/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Track project" })).toBeInTheDocument();
  expect(screen.getByText(/No projects tracked yet/)).toBeInTheDocument();
});

it("lists the sent side separately and does not offer to track from it", () => {
  render(<ProjectBoard userId="climber" projects={[sentProject]} hasMore={false} variant="sent" />);

  expect(headings("Sent projects")).toEqual(["Long Winter"]);
  expect(within(card("Long Winter")).getByText(/Sent/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Track project" })).not.toBeInTheDocument();
});

it("says nothing is sent yet without inviting a track that belongs on the other tab", () => {
  render(<ProjectBoard userId="climber" projects={[]} hasMore={false} variant="sent" />);

  expect(screen.getByText(/No sent projects yet/)).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Filter projects" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Track project" })).not.toBeInTheDocument();
});
