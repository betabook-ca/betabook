import type { ClimbType } from "@/lib/grades";

export type HighlightSession = {
  id: number;
  entryDate: string;
  climbId: number;
  climbName: string;
  climbType: ClimbType;
  sent: boolean;
  isAscent: boolean;
  companions: { id: string; name: string }[];
};

/** A logged send. Many have no journal entry: undated sends, sends from
 * before the journal, and imports without a date. */
export type HighlightSend = { climbId: number; dateSent: string | null };

export function buildAnalyticsHighlights(
  rows: readonly HighlightSession[],
  scope: ClimbType,
  years: readonly number[],
  sends: readonly HighlightSend[],
) {
  const lastYear = years.length ? Math.max(...years) : Infinity;
  const yearOf = (date: string) => Number(date.slice(0, 4));
  // A project is a climb not yet sent by the end of the selected years. An
  // undated send has no year, so its climb counts as sent in every period.
  const sentByPeriodEnd = new Set(
    sends
      .filter((send) => send.dateSent == null || yearOf(send.dateSent) <= lastYear)
      .map((send) => send.climbId),
  );
  // Sorted across all years so each climb's first ascent is known before the
  // year filter: a climb sent in an earlier year has only post-send sessions.
  const sessions = rows
    .filter((row) => row.climbType === scope)
    .toSorted((a, b) => a.entryDate.localeCompare(b.entryDate) || a.id - b.id);
  const ascended = new Set<number>();
  const climbs = new Map<
    number,
    {
      id: number;
      name: string;
      /** Sessions up to and including the first send. */
      sessions: number;
      repeats: number;
      firstSend: string | null;
    }
  >();
  const partners = new Map<string, { id: string; name: string; days: Set<string> }>();
  for (const row of sessions) {
    const afterSend = ascended.has(row.climbId);
    if (row.isAscent) {
      ascended.add(row.climbId);
      if (yearOf(row.entryDate) <= lastYear) sentByPeriodEnd.add(row.climbId);
    }
    if (years.length && !years.includes(yearOf(row.entryDate))) continue;
    const climb = climbs.get(row.climbId) ?? {
      id: row.climbId,
      name: row.climbName,
      sessions: 0,
      repeats: 0,
      firstSend: null,
    };
    if (!afterSend) climb.sessions += 1;
    if (row.isAscent) climb.firstSend = row.entryDate;
    if (row.sent && !row.isAscent) climb.repeats += 1;
    climbs.set(row.climbId, climb);
    for (const companion of row.companions) {
      const partner = partners.get(companion.id) ?? { ...companion, days: new Set<string>() };
      partner.days.add(row.entryDate);
      partners.set(companion.id, partner);
    }
  }
  const byClimb = [...climbs.values()];
  const biggestProject =
    byClimb
      .filter((c) => !sentByPeriodEnd.has(c.id))
      .toSorted((a, b) => b.sessions - a.sessions || a.id - b.id)[0] ?? null;
  const persistence =
    byClimb
      .filter((c) => c.firstSend && c.sessions > 1)
      .toSorted((a, b) => b.sessions - a.sessions || a.id - b.id)[0] ?? null;
  const favoriteRepeat =
    byClimb
      .filter((c) => c.repeats > 0)
      .toSorted((a, b) => b.repeats - a.repeats || a.id - b.id)[0] ?? null;
  const partner = [...partners.values()].toSorted(
    (a, b) => b.days.size - a.days.size || a.id.localeCompare(b.id),
  )[0];
  return {
    biggestProject,
    persistence,
    favoriteRepeat,
    partner: partner ? { id: partner.id, name: partner.name, days: partner.days.size } : null,
  };
}
