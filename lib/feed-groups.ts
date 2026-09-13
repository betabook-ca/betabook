import type { FeedDay } from "@/db/queries/feed";
import type { FeedView } from "@/lib/feed";

export type FeedEntry = { day: FeedDay; activity: FeedDay["activities"][number] };
export type FeedCard =
  | { kind: "day"; key: string; day: FeedDay }
  | {
      kind: "group";
      key: string;
      date: string;
      entryKind: "climb" | "training";
      entries: FeedEntry[];
    };
type Group = Extract<FeedCard, { kind: "group" }>;
type Candidate = FeedEntry & { scope: string };
type Buckets = Map<string, Map<string, number[]>>;
const COUNT_KEY = {
  send: "sends",
  repeat: "repeats",
  session: "sessions",
  training: "training",
} as const;

function dayCard(day: FeedDay): Extract<FeedCard, { kind: "day" }> {
  return { kind: "day", key: JSON.stringify([day.date, day.userId]), day };
}
function collectCandidates(days: FeedDay[]): { entries: Candidate[]; buckets: Buckets } {
  const entries: Candidate[] = [];
  const buckets: Buckets = new Map();
  for (const day of days) {
    for (const activity of day.activities) {
      if (activity.kind !== "send" && !day.journalVisible) continue;
      if (activity.kind !== "training" && activity.climbId == null) continue;
      const scope = JSON.stringify([
        day.date,
        activity.kind === "training" ? "training" : activity.climbId,
      ]);
      const authors = buckets.get(scope) ?? new Map<string, number[]>();
      const indices = authors.get(day.userId) ?? [];
      indices.push(entries.length);
      authors.set(day.userId, indices);
      buckets.set(scope, authors);
      entries.push({ day, activity, scope });
    }
  }
  return { entries, buckets };
}
function connectTags(
  entries: Candidate[],
  buckets: Buckets,
  connect: (a: number, b: number) => void,
) {
  for (const [index, { day, activity, scope }] of entries.entries()) {
    // Companions identify company on the entry, independently of its outcome.
    if (!day.journalVisible) continue;
    const authors = buckets.get(scope);
    for (const companion of activity.companions ?? []) {
      if (companion.id === day.userId) continue;
      const others = authors?.get(companion.id) ?? [];
      if (!others.length) continue;
      for (const other of others) connect(index, other);
      // Once authors are connected on a climb/day, include all their loaded
      // statuses there. Training keeps independent source entries separate.
      if (activity.kind !== "training")
        for (const own of authors?.get(day.userId) ?? []) connect(index, own);
    }
  }
}
function connectedEntries(entries: Candidate[], buckets: Buckets): FeedEntry[][] {
  const parents = entries.map((_, index) => index);
  function root(index: number): number {
    let current = index;
    while (parents[current] !== current) {
      parents[current] = parents[parents[current]];
      current = parents[current];
    }
    return current;
  }
  connectTags(entries, buckets, (a, b) => {
    const first = root(a);
    const second = root(b);
    parents[Math.max(first, second)] = Math.min(first, second);
  });
  const components = new Map<number, FeedEntry[]>();
  for (const [index, { day, activity }] of entries.entries()) {
    const key = root(index);
    const group = components.get(key) ?? [];
    group.push({ day, activity });
    components.set(key, group);
  }
  return [...components.values()].filter(
    (group) => new Set(group.map((entry) => entry.day.userId)).size >= 2,
  );
}
function indexGroups(groups: FeedEntry[][]): Map<FeedDay["activities"][number], Group> {
  const grouped = new Map<FeedDay["activities"][number], Group>();
  for (const entries of groups) {
    const first = entries[0];
    const entryKind = first.activity.kind === "training" ? "training" : "climb";
    const card: Group = {
      kind: "group",
      key: JSON.stringify([
        "group",
        first.day.date,
        entryKind,
        first.activity.climbId,
        first.day.userId,
        first.activity.id,
      ]),
      date: first.day.date,
      entryKind,
      entries,
    };
    for (const entry of entries) grouped.set(entry.activity, card);
  }
  return grouped;
}
function projectDays(
  days: FeedDay[],
  grouped: Map<FeedDay["activities"][number], Group>,
): FeedCard[] {
  const cards: FeedCard[] = [];
  const emitted = new Set<Group>();
  for (const day of days) {
    const remaining = { ...day, activities: [] as FeedDay["activities"] };
    let moved = false;
    for (const activity of day.activities) {
      const group = grouped.get(activity);
      if (!group) {
        remaining.activities.push(activity);
        continue;
      }
      moved = true;
      remaining[COUNT_KEY[activity.kind]] -= 1;
      if (!emitted.has(group)) {
        cards.push(group);
        emitted.add(group);
      }
    }
    if (
      !moved ||
      remaining.activities.length ||
      remaining.sends + remaining.repeats + remaining.sessions + remaining.training > 0
    )
      cards.push(dayCard(moved ? remaining : day));
  }
  return cards;
}
/** Presentation only: preserve original days for cursors and permission refreshes.
 * Sends view deliberately omits companion enrichment and grouping. */
export function buildFeedCards(days: FeedDay[], view: FeedView): FeedCard[] {
  if (view === "sends") return days.map(dayCard);
  const { entries, buckets } = collectCandidates(days);
  return projectDays(days, indexGroups(connectedEntries(entries, buckets)));
}
