import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import type { FeedDay } from "@/db/queries/feed";

import { FeedTimeline } from "./feed-timeline";

const activity: FeedDay["activities"][number] = {
  id: 1,
  kind: "send",
  climbId: 12,
  climbName: "Quiet Arete",
  climbType: "boulder",
  climbGrade: 5,
  reportedGrade: 7,
  gradeFeel: "high",
  ascentStyle: "redpoint",
  areaId: 3,
  areaName: "Pine Canyon",
  body: "Found the sequence.",
  companions: [{ id: "sam", name: "Sam Rivera", isSelf: false }],
};
const day: FeedDay = {
  userId: "alex",
  name: "Alex Rivera",
  image: null,
  date: "2026-09-01",
  journalVisible: true,
  sends: 1,
  sessions: 0,
  repeats: 0,
  training: 0,
  activities: [activity],
};
const friend: FeedDay = {
  ...day,
  userId: "sam",
  name: "Sam Rivera",
  sends: 0,
  sessions: 1,
  activities: [
    {
      ...activity,
      id: 2,
      kind: "session",
      body: "Still trying.",
      ascentStyle: null,
      companions: [],
    },
  ],
};

it("uses a shared climb heading and one date, retaining statuses, notes and grade ownership", () => {
  render(<FeedTimeline days={[day, friend]} view="all" />);
  expect(screen.getAllByText("Sep 1, 2026")).toHaveLength(1);
  const card = screen.getByRole("article", { name: "Quiet Arete" });
  const header = within(card).getByRole("heading", { name: "Quiet Arete" });
  expect(within(header).getByRole("link", { name: "Quiet Arete" })).toHaveAttribute(
    "href",
    "/climbs/12/quiet-arete",
  );
  expect(within(card).getByText("Send · Redpoint")).toBeVisible();
  expect(within(card).getByText("Session", { exact: true })).toBeVisible();
  expect(within(card).getAllByText(/Felt high-end/)).toHaveLength(1);
  expect(within(card).getByText(/Felt high-end/)).toHaveTextContent("Felt high-end for the grade");
  expect(within(card).getByText("Still trying.")).toBeVisible();
  expect(within(card).getByText("Found the sequence.")).toBeVisible();
  expect(screen.queryByText(/^With /)).not.toBeInTheDocument();
});

it.each([true, false])(
  "opens the appropriate day destination with journalVisible=%s",
  (journalVisible) => {
    const { rerender } = render(<FeedTimeline days={[{ ...day, journalVisible }]} view="all" />);
    const label = "View activity for Alex Rivera on Sep 1, 2026";
    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      `/users/alex/${journalVisible ? "journal" : "sends"}?date=2026-09-01`,
    );
    rerender(<FeedTimeline days={[{ ...day, journalVisible }]} view="sends" />);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      "/users/alex/sends?date=2026-09-01",
    );
    expect(screen.queryByText(/^With /)).not.toBeInTheDocument();
  },
);

it("retains unseen activity counts when all loaded previews move into a group", () => {
  render(<FeedTimeline days={[{ ...day, sends: 3, training: 1 }, friend]} view="all" />);
  expect(screen.getByRole("article", { name: "Quiet Arete" })).toBeVisible();
  expect(
    screen.getByRole("link", { name: "See 3 more activities from Alex Rivera" }),
  ).toHaveAttribute("href", "/users/alex/journal?date=2026-09-01");
});

it("keeps every ungrouped climb and handles days with no loaded previews", () => {
  render(
    <FeedTimeline
      days={[
        {
          ...day,
          sends: 2,
          activities: [activity, { ...activity, id: 3, climbId: 13, climbName: "Pine Slab" }],
        },
        { ...friend, date: "2026-08-31", sessions: 2, activities: [] },
      ]}
      view="all"
    />,
  );
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Pine Slab" })).toHaveAttribute(
    "href",
    "/climbs/13/pine-slab",
  );
  expect(
    screen.getByRole("link", { name: "See 2 more activities from Sam Rivera" }),
  ).toHaveAttribute("href", "/users/sam/journal?date=2026-08-31");
});

it("expands and collapses loaded group entries locally while preserving focus", async () => {
  const user = userEvent.setup();
  render(
    <FeedTimeline
      days={[
        day,
        {
          ...friend,
          repeats: 1,
          activities: [
            ...friend.activities,
            { ...activity, id: 3, kind: "repeat", body: "A repeat lap.", companions: [] },
          ],
        },
      ]}
      view="all"
    />,
  );
  expect(screen.getByText("A repeat lap.")).not.toBeVisible();
  await user.click(screen.getByRole("button", { name: "Show more: 1 repeat" }));
  expect(screen.getByText("A repeat lap.")).toBeVisible();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "Show more: 1 repeat" })).toHaveFocus();
  expect(screen.getByText("A repeat lap.")).not.toBeVisible();
});

it("keeps sessions gradeless and describes matching-grade feel without implying a new grade", () => {
  const { rerender } = render(<FeedTimeline days={[friend]} view="all" />);
  expect(screen.queryByText("V4", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText(/Suggested|Felt|felt/)).not.toBeInTheDocument();
  rerender(
    <FeedTimeline
      days={[{ ...day, activities: [{ ...activity, reportedGrade: 5, gradeFeel: "low" }] }]}
      view="all"
    />,
  );
  expect(screen.getByText(/^Felt low-end for/)).toHaveTextContent("Felt low-end for the grade");
});

it("renders training and companions without any real destinations in tutorial mode", () => {
  render(
    <FeedTimeline
      days={[
        {
          ...day,
          training: 1,
          activities: [
            ...day.activities,
            {
              ...activity,
              id: 4,
              kind: "training",
              climbId: null,
              climbName: null,
              climbType: null,
              climbGrade: null,
              areaId: null,
              areaName: null,
              body: "Mobility work.",
            },
          ],
        },
      ]}
      view="all"
      links={false}
    />,
  );
  expect(screen.getByText("Mobility work.")).toBeVisible();
  expect(screen.getByText("Send · Redpoint")).toBeVisible();
  expect(screen.getAllByText("Training")).toHaveLength(2);
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("removes all grades when the send becomes a session, including stale opinions", () => {
  const { rerender } = render(<FeedTimeline days={[day]} view="all" />);
  expect(screen.getByText("V6", { exact: true })).toBeVisible();
  rerender(
    <FeedTimeline
      days={[{ ...day, sends: 0, sessions: 1, activities: [{ ...activity, kind: "session" }] }]}
      view="all"
    />,
  );
  expect(screen.getByText("Session", { exact: true })).toBeVisible();
  expect(screen.queryByText("V4", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText("V6", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText(/Suggested|Felt high-end/)).not.toBeInTheDocument();
});

it.each([
  [7, "V6"],
  [0, "VB"],
  [null, "V4"],
] as const)(
  "uses the climber's grade %s or the posted fallback on completed activity",
  (reportedGrade, label) => {
    render(
      <FeedTimeline
        days={[{ ...day, activities: [{ ...activity, reportedGrade, gradeFeel: "solid" }] }]}
        view="all"
      />,
    );
    expect(screen.getByText(label, { exact: true })).toBeVisible();
    if (reportedGrade != null)
      expect(screen.queryByText("V4", { exact: true })).not.toBeInTheDocument();
  },
);
