import { formatDate } from "@/lib/format-date";
import type { ShareImageContent, ShareImageStat } from "@/lib/share-image";

import { DISCIPLINE_NAMES, monthName, WEEKDAY_NAMES } from "./labels";
import type { DisciplineRanking, YearChapterId, YearReview } from "./types";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function card(
  review: YearReview,
  ownerName: string,
  title: string,
  stats: ShareImageStat[],
  description: string | null = null,
  statsHeading?: string,
): ShareImageContent<ShareImageStat> {
  return {
    title,
    status: null,
    dates: `${ownerName}'s ${review.year} in climbing`,
    description,
    stats: stats.slice(0, 4),
    ...(statsHeading ? { statsHeading } : {}),
  };
}

function rankingStats(disciplines: DisciplineRanking[]): ShareImageStat[] {
  return disciplines.flatMap(({ type, rows }) =>
    rows.slice(0, disciplines.length > 1 ? 2 : 4).map((row) => ({
      label: `${capitalize(DISCIPLINE_NAMES[type])} #${row.rank}`,
      value: row.label,
      sub: row.climbName,
    })),
  );
}

/**
 * One story card per chapter that has something to show, keyed by chapter.
 * A core chapter in its zero state gets none: an image of zeros isn't worth
 * sharing.
 */
// oxlint-disable-next-line complexity -- one independent, optional card per chapter
export function yearShareCards(
  review: YearReview,
  ownerName: string,
): Partial<Record<YearChapterId, ShareImageContent<ShareImageStat>>> {
  const c = review.chapters;
  const cards: Partial<Record<YearChapterId, ShareImageContent<ShareImageStat>>> = {};

  if (review.active) {
    cards.intro = card(review, ownerName, `${review.year} in review`, [
      { label: "Days out", value: String(c.intro.daysOut), sub: null },
      { label: "Sends", value: String(c.intro.sends), sub: null },
      { label: "Areas visited", value: String(c.intro.areasVisited), sub: null },
    ]);
  }
  if (c.days.daysOut > 0) {
    const busiest = c.days.byMonth.indexOf(Math.max(...c.days.byMonth)) + 1;
    cards.days = card(review, ownerName, "Days outside", [
      { label: "Days out", value: String(c.days.daysOut), sub: null },
      {
        label: "Busiest month",
        value: monthName(busiest),
        sub: plural(c.days.byMonth[busiest - 1], "day"),
      },
    ]);
  }
  if (c.calendar) {
    const { peakMonth, hardestMonths, weekday } = c.calendar;
    cards.calendar = card(review, ownerName, "Your climbing calendar", [
      {
        label: "Peak month",
        value: monthName(peakMonth.month),
        sub: plural(peakMonth.days, "day"),
      },
      ...hardestMonths.slice(0, 2).map((entry) => ({
        label: `Hardest ${DISCIPLINE_NAMES[entry.type]}`,
        value: monthName(entry.month),
        sub: `${entry.label}, ${entry.climbName}`,
      })),
      ...(weekday
        ? [
            {
              label: "You climb best on",
              value: weekday.best.map((day) => WEEKDAY_NAMES[day]).join(" & "),
              sub: `Top ${weekday.topPercent}% of your year`,
            },
          ]
        : []),
    ]);
  }
  if (c.biggestDay) {
    const { biggestDay, rampage } = c.biggestDay;
    cards["biggest-day"] = card(review, ownerName, "Biggest days", [
      ...(biggestDay
        ? [
            {
              label: "Biggest day",
              value: plural(biggestDay.climbs, "climb"),
              sub: formatDate(biggestDay.date),
            },
          ]
        : []),
      ...(rampage
        ? [
            {
              label: "Biggest rampage",
              value: plural(rampage.sends, "send"),
              sub: formatDate(rampage.date),
            },
          ]
        : []),
    ]);
  }
  if (c.homeTurf) {
    const { homeTurf } = c;
    cards["home-turf"] = card(
      review,
      ownerName,
      homeTurf.spread ? "You got around" : homeTurf.place.name,
      [
        { label: "Days there", value: String(homeTurf.days), sub: `of ${homeTurf.totalDays}` },
        { label: "Sends there", value: String(homeTurf.sends), sub: null },
      ],
      homeTurf.spread
        ? `Across ${homeTurf.breakdown.map((entry) => entry.name).join(", ")}`
        : "Your home crag",
    );
  }
  if (c.newClimbs) {
    cards["new-climbs"] = card(review, ownerName, "New ground", [
      {
        label: "New climbs",
        value: String(c.newClimbs.newClimbs),
        sub: `of ${c.newClimbs.tried} tried`,
      },
      ...(c.newClimbs.firstVisits.length
        ? [
            {
              label: "First visits",
              value: String(c.newClimbs.firstVisits.length),
              sub: c.newClimbs.firstVisits[0].place.name,
            },
          ]
        : []),
    ]);
  }
  if (c.trips) {
    cards.trips = card(review, ownerName, `Trips of ${review.year}`, [
      { label: "Trips", value: String(c.trips.trips.length), sub: null },
      { label: "Days on trips", value: String(c.trips.totalDays), sub: null },
      ...(c.trips.biggest
        ? [
            {
              label: "Biggest trip",
              value: plural(c.trips.biggest.climbingDays, "day"),
              sub: c.trips.biggest.name,
            },
          ]
        : []),
    ]);
  }
  if (c.newGrades) {
    cards["new-grades"] = card(
      review,
      ownerName,
      "New grade unlocked",
      c.newGrades.disciplines.flatMap(({ steps }) =>
        steps
          .toReversed()
          .slice(0, 2)
          .map((step) => ({
            label: formatDate(step.date),
            value: step.label,
            sub: step.climbName,
          })),
      ),
    );
  }
  if (c.hardest.disciplines.length)
    cards.hardest = card(review, ownerName, "Hardest sends", rankingStats(c.hardest.disciplines));
  if (c.flashes)
    cards.flashes = card(review, ownerName, "Hardest flashes", rankingStats(c.flashes.disciplines));
  if (c.onsights)
    cards.onsights = card(
      review,
      ownerName,
      "Hardest onsights",
      rankingStats(c.onsights.disciplines),
    );
  if (c.styles) {
    cards.styles = card(
      review,
      ownerName,
      "How you sent it",
      c.styles.disciplines.map((entry) => ({
        label: `${capitalize(DISCIPLINE_NAMES[entry.type])} first try`,
        value: `${Math.round(entry.firstTryRate * 100)}%`,
        sub: `${entry.flash + entry.onsight} of ${entry.flash + entry.onsight + entry.redpoint} sends`,
      })),
    );
  }
  const pyramids = c.pyramids.disciplines.filter((entry) => entry.rows.length);
  if (pyramids.length) {
    cards.pyramids = card(
      review,
      ownerName,
      "Grade pyramids",
      pyramids.map((entry) => ({
        label: capitalize(DISCIPLINE_NAMES[entry.type]),
        value: `${entry.rows.at(-1)?.label}–${entry.rows[0].label}`,
        sub: plural(
          entry.rows.reduce((total, row) => total + row.count, 0),
          "send",
        ),
      })),
    );
  }
  if (c.partner) {
    cards.partner = card(review, ownerName, "Favourite partner", [
      { label: "Partner", value: c.partner.partner.name, sub: plural(c.partner.days, "day") },
    ]);
  }
  if (c.gotAway) {
    const { climbs } = c.gotAway;
    cards["got-away"] = card(
      review,
      ownerName,
      climbs.length === 1 ? "The one that got away" : "The ones that got away",
      climbs.map((climb) => ({
        label: climb.label,
        value: plural(climb.sessions, "session"),
        sub: climb.climbName,
      })),
    );
  }
  if (c.notWorthThePump) {
    cards["not-worth-the-pump"] = card(
      review,
      ownerName,
      "Not worth the pump",
      c.notWorthThePump.climbs.map((climb) => ({
        label: climb.label,
        value: "★".repeat(climb.rating),
        sub: climb.climbName,
      })),
    );
  }
  if (c.personas?.personas.length) {
    const [top, ...rest] = c.personas.personas;
    cards.personas = card(
      review,
      ownerName,
      top.name,
      [],
      rest.length
        ? `${top.why}. With a side of ${rest.map((persona) => persona.name).join(" and ")}.`
        : top.why,
    );
  }
  return cards;
}
