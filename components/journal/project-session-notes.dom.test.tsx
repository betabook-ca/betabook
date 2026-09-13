import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import type { JournalEntry } from "@/db/queries";

import { ProjectSessionNotes } from "./project-session-notes";

function session(overrides: Partial<JournalEntry> & { id: number }): JournalEntry {
  return {
    climbId: 3,
    kind: "session",
    sent: false,
    entryDate: "2026-09-01",
    body: null,
    tags: [],
    companions: [],
    climbName: "Moon Slab",
    climbType: "boulder",
    climbGrade: 5,
    areaId: 8,
    areaName: "Cedar Block",
    isAscent: false,
    isSendComment: false,
    ...overrides,
  };
}

const preloaded = [
  session({ id: 30, entryDate: "2026-09-01", body: "One move from the top." }),
  session({ id: 20, entryDate: "2026-08-12", body: "Linked the bottom half." }),
  session({ id: 10, entryDate: "2026-07-30" }),
];

const BASE_URL = "https://betabook.test";

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function respondWith(body: { entries: JournalEntry[]; hasMore: boolean }) {
  return new Response(JSON.stringify({ ...body, areaBreadcrumbs: {} }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

function renderNotes(sessionCount: number) {
  return render(
    <ProjectSessionNotes
      userId="climber"
      climbId={3}
      sessionCount={sessionCount}
      initialSessions={preloaded}
    />,
  );
}

it("lists every preloaded session, leaving a session without a note as just its date", () => {
  renderNotes(preloaded.length);

  const items = screen.getAllByRole("listitem");
  expect(items).toHaveLength(3);
  expect(items[0]).toHaveTextContent("One move from the top.");
  expect(items[2].querySelector("time")?.dateTime).toBe("2026-07-30");
  expect(items[2]).toHaveTextContent(/^Jul 30, 2026$/);
  expect(screen.queryByRole("button", { name: /Load more/ })).not.toBeInTheDocument();
});

it("pages the rest of a long project's history from the journal, oldest last", async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValue(
    respondWith({
      entries: [session({ id: 5, entryDate: "2026-06-02", body: "First touch. No idea." })],
      hasMore: false,
    }),
  );
  renderNotes(4);

  await user.click(screen.getByRole("button", { name: "Load more" }));

  expect(await screen.findByText("First touch. No idea.")).toBeInTheDocument();
  const [requested] = fetchMock.mock.calls[0];
  const url = new URL(requested instanceof Request ? requested.url : String(requested), BASE_URL);
  expect(url.pathname).toBe("/api/users/climber/journal");
  expect(url.searchParams.get("climbId")).toBe("3");
  expect(url.searchParams.get("view")).toBe("sessions");
  // Paging continues below the oldest preloaded session, not from the top.
  expect(url.searchParams.get("cursorDate")).toBe("2026-07-30");
  expect(url.searchParams.get("cursorId")).toBe("10");
  expect(
    screen.getAllByRole("listitem").map((item) => item.querySelector("time")?.dateTime),
  ).toEqual(["2026-09-01", "2026-08-12", "2026-07-30", "2026-06-02"]);
  expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
});

it("keeps the loaded sessions and offers a retry when a page fails", async () => {
  const user = userEvent.setup();
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  renderNotes(4);

  await user.click(screen.getByRole("button", { name: "Load more" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load more — try again.");
  expect(screen.getByText("One move from the top.")).toBeInTheDocument();

  fetchMock.mockResolvedValueOnce(
    respondWith({
      entries: [session({ id: 5, entryDate: "2026-06-02", body: "First touch. No idea." })],
      hasMore: false,
    }),
  );
  await user.click(screen.getByRole("button", { name: "Load more" }));

  expect(await screen.findByText("First touch. No idea.")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
});
