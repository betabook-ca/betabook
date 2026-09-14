import { isRealIsoDate } from "@/lib/sends";

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

export function parseFeedCursor(raw: string | null, view: FeedView): FeedCursor | null {
  if (raw === null) return null;
  try {
    if (raw.length > 500) throw new Error();
    const value = JSON.parse(raw) as Partial<FeedCursor> | null;
    if (
      !value ||
      value.version !== 1 ||
      value.view !== view ||
      typeof value.date !== "string" ||
      !isRealIsoDate(value.date) ||
      typeof value.userId !== "string" ||
      !value.userId.trim() ||
      value.userId.length > 128
    )
      throw new Error();
    return { version: 1, date: value.date, userId: value.userId, view };
  } catch {
    throw new Error("Invalid feed cursor");
  }
}
