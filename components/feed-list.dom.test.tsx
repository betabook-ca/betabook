import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import type { FeedDay, FeedPage } from "@/db/queries/feed";

import { FeedList } from "./feed-list";

const boundary = vi.hoisted(() => ({
  fetch:
    vi.fn<
      (url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<FeedPage> }>
    >(),
  router: { refresh: vi.fn<() => void>(), replace: vi.fn<(href: string) => void>() },
  viewerId: "viewer",
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: boundary.fetch }));
vi.mock("next/navigation", () => ({ useRouter: () => boundary.router }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: boundary.viewerId } }, isPending: false }),
  },
}));

const day: FeedDay = {
  userId: "alex",
  name: "Alex",
  image: null,
  date: "2026-09-01",
  journalVisible: true,
  sends: 0,
  sessions: 1,
  repeats: 0,
  training: 0,
  activities: [
    {
      id: 1,
      kind: "session",
      climbId: 12,
      climbName: "Quiet Arete",
      climbType: "boulder",
      climbGrade: 5,
      reportedGrade: null,
      gradeFeel: null,
      ascentStyle: null,
      areaId: null,
      areaName: null,
      body: "Alex's note",
      companions: [{ id: "sam", name: "Sam", isSelf: false }],
    },
  ],
};
const friend: FeedDay = {
  ...day,
  userId: "sam",
  name: "Sam",
  activities: [{ ...day.activities[0], id: 2, body: "Sam's note", companions: [] }],
};
const firstPage = { days: [day], hasMore: true };
beforeEach(() => {
  vi.clearAllMocks();
  boundary.viewerId = "viewer";
});

it("groups appended pages while keeping pagination cursors tied to the original days", async () => {
  const user = userEvent.setup();
  boundary.fetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ days: [friend], hasMore: true }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [
          {
            ...day,
            date: "2026-08-31",
            activities: [{ ...day.activities[0], id: 3, body: "Older note" }],
          },
        ],
        hasMore: false,
      }),
    });
  render(<FeedList initialPage={firstPage} view="all" hasFriends viewerId="viewer" />);
  await user.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Sam's note")).toBeVisible();
  expect(screen.getAllByRole("article")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Older note")).toBeVisible();
  expect(screen.getByText("End of feed")).toBeVisible();
  expect(screen.getAllByRole("article")).toHaveLength(2);
  const cursors = boundary.fetch.mock.calls.map(([url]) =>
    JSON.parse(new URL(url, "https://betabook.test").searchParams.get("cursor") ?? "null"),
  );
  expect(cursors).toEqual([
    { version: 1, date: "2026-09-01", userId: "alex", view: "all" },
    { version: 1, date: "2026-09-01", userId: "sam", view: "all" },
  ]);
});

it("retains the visible feed on a page failure and retries the same cursor", async () => {
  const user = userEvent.setup();
  boundary.fetch
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ days: [friend], hasMore: false }) });
  render(<FeedList initialPage={firstPage} view="all" hasFriends viewerId="viewer" />);
  await user.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Couldn't load more — try again.")).toBeVisible();
  expect(screen.getByText("Alex's note")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Sam's note")).toBeVisible();
  expect(boundary.fetch.mock.calls[0][0]).toBe(boundary.fetch.mock.calls[1][0]);
});

it("removes the old viewer's feed when the signed-in account changes", async () => {
  const { rerender } = render(
    <FeedList initialPage={firstPage} view="all" hasFriends viewerId="viewer" />,
  );
  expect(screen.getByText("Alex's note")).toBeVisible();
  boundary.viewerId = "different";
  rerender(<FeedList initialPage={firstPage} view="all" hasFriends viewerId="viewer" />);
  await waitFor(() => expect(screen.queryByText("Alex's note")).not.toBeInTheDocument());
  expect(screen.getByText("Your account changed. Refresh to see your feed.")).toBeVisible();
});
