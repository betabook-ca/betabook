export type FeedView = "all" | "sends";
export type FeedCursor = { version: 1; date: string; userId: string; view: FeedView };

export function feedDayHref(
  day: { userId: string; date: string; journalVisible: boolean },
  view: FeedView,
): string {
  return `/users/${day.userId}/${view === "all" && day.journalVisible ? "journal" : "sends"}?date=${day.date}`;
}

export function parseFeedView(value: unknown): FeedView {
  return value === "sends" ? "sends" : "all";
}
