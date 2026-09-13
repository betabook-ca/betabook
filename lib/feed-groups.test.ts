import { expect, it } from "vitest";

import type { FeedDay } from "@/db/queries/feed";

import { buildFeedCards } from "./feed-groups";

function entry(
  id: number,
  extra: Partial<FeedDay["activities"][number]> = {},
): FeedDay["activities"][number] {
  return {
    id,
    kind: "session",
    climbId: 10,
    climbName: "Shared climb",
    climbType: "boulder",
    climbGrade: 4,
    reportedGrade: null,
    gradeFeel: null,
    areaId: 1,
    areaName: "Woods",
    ascentStyle: null,
    body: `Note ${id}`,
    companions: [],
    ...extra,
  };
}
function withFriend(
  id: number,
  friend: string,
  extra: Partial<FeedDay["activities"][number]> = {},
) {
  return entry(id, { companions: [{ id: friend, name: friend, isSelf: false }], ...extra });
}
function training(id: number, companions: string[] = []): FeedDay["activities"][number] {
  return entry(id, {
    kind: "training",
    climbId: null,
    climbName: null,
    areaId: null,
    companions: companions.map((userId) => ({ id: userId, name: userId, isSelf: false })),
  });
}
function day(
  userId: string,
  activities: FeedDay["activities"],
  extra: Partial<FeedDay> = {},
): FeedDay {
  return {
    userId,
    name: userId,
    image: null,
    date: "2026-09-01",
    journalVisible: true,
    sends: activities.filter((a) => a.kind === "send").length,
    repeats: activities.filter((a) => a.kind === "repeat").length,
    sessions: activities.filter((a) => a.kind === "session").length,
    training: activities.filter((a) => a.kind === "training").length,
    activities,
    ...extra,
  };
}
it("deduplicates the same climb and date across explicitly connected authors, retaining every note and identity", () => {
  const days = [day("a", [withFriend(1, "b")]), day("b", [entry(2)])];
  const before = JSON.stringify(days);
  const cards = buildFeedCards(days, "all");
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({
    kind: "group",
    date: "2026-09-01",
    entryKind: "climb",
    entries: [
      { day: { userId: "a" }, activity: { id: 1, body: "Note 1" } },
      { day: { userId: "b" }, activity: { id: 2, body: "Note 2" } },
    ],
  });
  expect(JSON.stringify(days)).toBe(before);
});
it("deduplicates mixed send/repeat/session statuses while keeping unrelated previews and hidden counts with their author", () => {
  const cards = buildFeedCards(
    [
      day("a", [withFriend(1, "b"), entry(3, { kind: "send" }), entry(4, { climbId: 99 })], {
        sessions: 4,
        training: 1,
      }),
      day("b", [entry(2, { kind: "repeat" })]),
      day("c", [entry(5, { climbId: 98 })]),
    ],
    "all",
  );
  expect(cards.map((c) => c.kind)).toEqual(["group", "day", "day"]);
  expect(
    cards[0].kind === "group" &&
      cards[0].entries.map((e) => [e.day.userId, e.activity.id, e.activity.kind]),
  ).toEqual([
    ["a", 1, "session"],
    ["a", 3, "send"],
    ["b", 2, "repeat"],
  ]);
  expect(cards[1]).toMatchObject({
    kind: "day",
    day: { userId: "a", sends: 0, sessions: 3, training: 1, activities: [{ id: 4 }] },
  });
  expect(cards[2]).toMatchObject({ kind: "day", day: { userId: "c", activities: [{ id: 5 }] } });
});
it("retains a summary-only card when grouped previews were not the whole journal day", () => {
  const cards = buildFeedCards(
    [day("a", [withFriend(1, "b")], { sessions: 5 }), day("b", [entry(2)])],
    "all",
  );
  expect(cards).toHaveLength(2);
  expect(cards[1]).toMatchObject({
    kind: "day",
    day: { userId: "a", sessions: 4, activities: [] },
  });
});
it("joins later pages without changing source cursor order and recomputes refreshed data", () => {
  const initial = [day("a", [withFriend(1, "b")]), day("c", [withFriend(3, "d", { climbId: 20 })])];
  expect(buildFeedCards(initial, "all").map((c) => c.kind)).toEqual(["day", "day"]);
  const next = [...initial, day("b", [entry(2)]), day("d", [entry(4, { climbId: 20 })])];
  const cards = buildFeedCards(next, "all");
  expect(cards).toHaveLength(2);
  expect(cards.map((c) => c.kind === "group" && c.entries.map((e) => e.activity.id))).toEqual([
    [1, 2],
    [3, 4],
  ]);
  expect(next.at(-1)?.userId).toBe("d");
  expect(buildFeedCards([initial[0]], "all")).toMatchObject([
    { kind: "day", day: { userId: "a" } },
  ]);
});
it("keeps different climb IDs/dates, missing climbs, hidden journal rows, and one author's sessions separate", () => {
  for (const second of [
    day("b", [entry(2)], { date: "2026-09-02" }),
    day("b", [entry(2, { climbId: 20 })]),
    day("b", [entry(2, { climbId: null })]),
    day("b", [training(2)]),
    day("b", [entry(2)], { journalVisible: false }),
  ]) {
    expect(
      buildFeedCards([day("a", [withFriend(1, "b")]), second], "all").map((c) => c.kind),
    ).toEqual(["day", "day"]);
  }
  expect(buildFeedCards([day("a", [entry(1), entry(2)])], "all")).toMatchObject([
    { kind: "day", day: { activities: [{ id: 1 }, { id: 2 }] } },
  ]);
});
it("includes an explicitly tagged friend's authorized send while keeping Sends view ungrouped", () => {
  const author = day("a", [withFriend(1, "b")]);
  const friend = day("b", [entry(2, { kind: "send", companions: undefined })], {
    journalVisible: false,
  });
  expect(buildFeedCards([author, friend], "all")).toMatchObject([
    {
      kind: "group",
      entries: [{ activity: { id: 1, kind: "session" } }, { activity: { id: 2, kind: "send" } }],
    },
  ]);
  const sends = [day("a", [entry(3, { kind: "send" })]), friend];
  expect(buildFeedCards(sends, "sends").map((c) => c.kind)).toEqual(["day", "day"]);
});
it("uses a send or repeat's explicit companions without attributing that outcome to the friend", () => {
  for (const kind of ["send", "repeat"] as const) {
    const days = [day("a", [withFriend(1, "b", { kind }), entry(3)]), day("b", [entry(2)])];
    expect(buildFeedCards(days, "all")).toMatchObject([
      {
        kind: "group",
        entries: [
          { day: { userId: "a" }, activity: { id: 1, kind } },
          { day: { userId: "a" }, activity: { id: 3, kind: "session" } },
          { day: { userId: "b" }, activity: { id: 2, kind: "session" } },
        ],
      },
    ]);
    expect(buildFeedCards(days, "sends").map((card) => card.kind)).toEqual(["day", "day"]);
  }
});
it("never deduplicates matching climb/date without a visible tag between loaded authors", () => {
  for (const first of [entry(1), withFriend(1, "third-person")]) {
    expect(
      buildFeedCards([day("a", [first]), day("b", [entry(2)])], "all").map((c) => c.kind),
    ).toEqual(["day", "day"]);
  }
  expect(
    buildFeedCards([day("a", [withFriend(1, "c")]), day("b", [withFriend(2, "c")])], "all").map(
      (c) => c.kind,
    ),
  ).toEqual(["day", "day"]);
  expect(
    buildFeedCards(
      [
        day("a", [withFriend(1, "b", { kind: "send" })], { journalVisible: false }),
        day("b", [entry(2)]),
      ],
      "all",
    ).map((card) => card.kind),
  ).toEqual(["day", "day"]);
  expect(
    buildFeedCards([day("a", [entry(1)]), day("b", [entry(2)])], "all").map((c) => c.kind),
  ).toEqual(["day", "day"]);
});
it("groups one-way and transitive training tags across authors, but never by a shared third-party tag", () => {
  const days = [
    day("a", [training(1, ["b"])]),
    day("b", [training(2, ["c"])]),
    day("c", [training(3)]),
  ];
  const cards = buildFeedCards(days, "all");
  expect(cards).toHaveLength(1);
  expect(cards[0]).toMatchObject({
    kind: "group",
    entryKind: "training",
    entries: [{ activity: { id: 1 } }, { activity: { id: 2 } }, { activity: { id: 3 } }],
  });
  const common = [day("a", [training(1, ["c"])]), day("b", [training(2, ["c"])])];
  expect(buildFeedCards(common, "all").map((c) => c.kind)).toEqual(["day", "day"]);
  expect(
    buildFeedCards([day("a", [training(1, ["b"]), training(2, ["b"])])], "all").map((c) => c.kind),
  ).toEqual(["day"]);
});
it("does not use hidden, different-date or untagged training as a group bridge", () => {
  const first = day("a", [training(1, ["b"])]);
  for (const second of [
    day("b", [training(2)], { date: "2026-09-02" }),
    day("b", [training(2)], { journalVisible: false }),
  ]) {
    expect(buildFeedCards([first, second], "all").map((c) => c.kind)).toEqual(["day", "day"]);
  }
  expect(
    buildFeedCards([day("a", [training(1)]), day("b", [training(2)])], "all").map((c) => c.kind),
  ).toEqual(["day", "day"]);
  expect(buildFeedCards([first, day("b", [training(2)])], "sends").map((c) => c.kind)).toEqual([
    "day",
    "day",
  ]);
});
