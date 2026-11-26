import { clsx } from "clsx";
import type { ReactNode } from "react";

import { StatTiles } from "@/components/analytics-stat-tiles";
import { AscentStyle } from "@/components/ascent-style";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { DISCIPLINE_LABELS, DisciplineChip } from "@/components/ui/discipline-chip";
import { EYEBROW_CLASS } from "@/components/ui/eyebrow";
import { BarStrip } from "@/components/year-in-review/bar-strip";
import { CountUp } from "@/components/year-in-review/count-up";
import { VerticalPyramid } from "@/components/year-in-review/vertical-pyramid";
import { formatDate } from "@/lib/format-date";
import { climbHref } from "@/lib/slug";
import { tripHref } from "@/lib/trips";
import {
  DISCIPLINE_NAMES,
  monthName,
  WEEKDAY_NAMES,
  type DayHighlight,
  type DisciplineRanking,
  type TripCard,
  type YearChapterId,
  type YearPlace,
  type YearReview,
} from "@/lib/year-in-review";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
function ordinal(value: number): string {
  const teen = value % 100 >= 11 && value % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][value % 10] ?? "th");
  return `${value}${suffix}`;
}
const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

type YearReviewStoryMode =
  /** The owner's page: share images, logging links and the footnote. */
  | "owner"
  /** A link: the same recap without the owner's actions and logging nudges. */
  | "shared";

type StoryProps = {
  review: YearReview;
  ownerId: string;
  ownerName: string;
  mode: YearReviewStoryMode;
};

function Chapter({
  id,
  title,
  children,
}: {
  id: YearChapterId;
  title: string;
  children: ReactNode;
}) {
  const headingId = `year-chapter-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      className={clsx("flex flex-col gap-5", cardClass("fluid"))}
    >
      <h2 id={headingId} className="font-display text-3xl font-semibold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Hero({ value, children }: { value: number; children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3">
      {/* Keyed by value: a new year's number remounts instead of keeping the old one. */}
      <CountUp
        key={value}
        value={value}
        className="font-display text-7xl font-semibold tabular-nums"
      />
      <span className="text-lg text-muted">{children}</span>
    </p>
  );
}

function Nudge({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

function PlaceTrail({ place }: { place: YearPlace | null }) {
  if (!place) return null;
  return <span className="text-sm text-muted">{place.trail.join(" › ")}</span>;
}

/** A rampage day: every climb sent, nothing left unsent. Boulder days add
 * their vPoints. */
function DayCard({ day }: { day: DayHighlight }) {
  const where = day.place ? day.place.name : day.roots.join(" + ");
  return (
    <div className={clsx("flex flex-col gap-3", cardClass("sm", "bordered"))}>
      <p className="font-semibold">
        {formatDate(day.date)}
        {where ? ` · ${day.roots.length ? `across ${where}` : where}` : ""}
      </p>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <p className="flex items-baseline gap-2">
          <span className="font-display text-5xl font-semibold tabular-nums">{day.sends}</span>
          <span className="text-muted">{day.sends === 1 ? "send" : "sends"}</span>
        </p>
        {day.vPoints != null && (
          <p className="flex items-baseline gap-2">
            <span className="font-display text-5xl font-semibold tabular-nums">{day.vPoints}</span>
            <span className="text-muted">vPoints</span>
          </p>
        )}
      </div>
      {day.hardest && (
        <p className="text-sm text-muted">
          Hardest: {day.hardest.label}, {day.hardest.climbName}
        </p>
      )}
      <ul className="flex flex-wrap gap-1.5 text-xs">
        {day.list.slice(0, 12).map((climb) => (
          <li key={climb.climbId} className="rounded-full bg-accent/20 px-2 py-0.5 font-medium">
            {climb.climbName} {climb.label}
          </li>
        ))}
        {day.list.length > 12 && <li className="px-1 text-muted">+{day.list.length - 12} more</li>}
      </ul>
    </div>
  );
}

function Rankings({ disciplines }: { disciplines: DisciplineRanking[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {disciplines.map(({ type, rows }) => (
        <div key={type} className="flex flex-col gap-2">
          <DisciplineChip type={type} />
          <ol className="flex flex-col divide-y divide-separator">
            {rows.map((row) => (
              <li key={`${row.climbId}-${row.dateSent}`} className="flex items-center gap-3 py-2">
                <span className="w-6 text-sm text-muted tabular-nums">{row.rank}</span>
                <span className="w-14 font-display text-xl font-semibold">{row.label}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <AppLink
                    href={climbHref(row.climbId, row.climbName)}
                    className="truncate font-medium"
                  >
                    {row.climbName}
                  </AppLink>
                  <span className="truncate text-xs text-muted">
                    {formatDate(row.dateSent)}
                    {row.place ? ` · ${row.place.name}` : ""}
                  </span>
                </span>
                {row.ascentStyle !== "redpoint" && <AscentStyle type={row.ascentStyle} />}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** The trip cards under one trips highlight. A lone card takes the full
 * width; two or more share rows. The owner's cards link to the trip. */
function TripCards({
  cards,
  ownerId,
  owner,
}: {
  cards: TripCard[];
  ownerId: string;
  owner: boolean;
}) {
  return (
    <ul className={clsx("grid gap-3", cards.length > 1 && "md:grid-cols-2")}>
      {cards.map((trip, index) => (
        <li
          // A share link carries no trip ids, so its cards are keyed by position.
          key={owner ? trip.id : index}
          className={clsx("flex flex-col gap-1", cardClass("sm", "bordered"))}
        >
          {owner ? (
            <AppLink href={tripHref(ownerId, trip.id)} className="font-semibold">
              {trip.name}
            </AppLink>
          ) : (
            <span className="font-semibold">{trip.name}</span>
          )}
          <span className="text-xs text-muted">
            {formatDate(trip.startDate)} – {formatDate(trip.endDate)}
            {trip.location
              ? ` · ${trip.location.trail.join(" › ")}`
              : trip.roots.length
                ? ` · ${trip.roots.join(" + ")}`
                : ""}
          </span>
          <span className="text-sm">
            {plural(trip.climbingDays, "day")} · {plural(trip.sends, "send")}
            {trip.hardest.length
              ? ` · hardest ${trip.hardest
                  .map((entry) => `${DISCIPLINE_LABELS[entry.type]} ${entry.label}`)
                  .join(", ")}`
              : ""}
            {trip.newGrades ? ` · ${plural(trip.newGrades, "new grade")}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Every chapter, top to bottom: the four core chapters always, the rest
 * when earned. */
// oxlint-disable-next-line max-lines-per-function, complexity -- one long page of independent chapters
export function YearReviewStory({ review, ownerId, ownerName, mode }: StoryProps) {
  const { year, chapters: c } = review;
  const owner = mode === "owner";
  // A shared link is someone else's recap: name the owner, and leave out
  // nudges that tell the owner what to log.
  const whose = owner ? "Your" : `${ownerName}'s`;
  const nudge = (text: string) => (owner ? <Nudge>{text}</Nudge> : null);
  const chapter = (id: YearChapterId, title: string, body: ReactNode) => (
    <Chapter key={id} id={id} title={title}>
      {body}
    </Chapter>
  );
  const logLink = (text: string) =>
    owner ? (
      <AppLink href={`/users/${ownerId}/journal`} className="text-sm underline">
        {text}
      </AppLink>
    ) : null;

  const sections: ReactNode[] = [];

  sections.push(
    chapter(
      "intro",
      "The year at a glance",
      review.active ? (
        <StatTiles
          className="grid-cols-3"
          tiles={[
            { label: "Days out", value: c.intro.daysOut },
            { label: "Sends", value: c.intro.sends },
            { label: "Areas visited", value: c.intro.areasVisited },
          ]}
        />
      ) : (
        <>
          <Nudge>No climbing logged in {year} yet.</Nudge>
          {logLink("Log a session")}
        </>
      ),
    ),
  );

  sections.push(
    chapter(
      "days",
      "Days outside",
      <>
        <Hero value={c.days.daysOut}>{c.days.daysOut === 1 ? "day out" : "days out"}</Hero>
        <BarStrip
          values={c.days.byMonth}
          labels={MONTH_LABELS}
          summary={c.days.byMonth
            .map((days, index) => `${monthName(index + 1)}: ${days}`)
            .join(", ")}
        />
        {c.days.daysOut < 3 && (
          <>
            {nudge("Log your sessions to see your year take shape.")}
            {logLink("Log a session")}
          </>
        )}
      </>,
    ),
  );

  if (c.calendar) {
    const { peakMonth, hardestMonths, weekday } = c.calendar;
    sections.push(
      chapter(
        "calendar",
        `${whose} climbing calendar`,
        <div className="grid gap-4 md:grid-cols-3">
          <div className={clsx("flex flex-col gap-2", cardClass("sm", "bordered"))}>
            <span className={EYEBROW_CLASS}>Busiest month</span>
            <p className="font-display text-3xl font-semibold">{monthName(peakMonth.month)}</p>
            <p className="text-sm text-muted">
              {plural(peakMonth.days, "day")} out · {plural(peakMonth.sends, "send")}
            </p>
            <BarStrip
              values={c.calendar.daysByMonth}
              labels={MONTH_LABELS}
              highlight={[peakMonth.month - 1]}
              summary={`Days out by month, peaking in ${monthName(peakMonth.month)}`}
            />
          </div>
          <div className={clsx("flex flex-col gap-2", cardClass("sm", "bordered"))}>
            <span className={EYEBROW_CLASS}>Hardest send</span>
            {hardestMonths.map((entry) => (
              <p key={entry.type}>
                <span className="font-display text-2xl font-semibold">
                  {monthName(entry.month)}
                </span>
                <span className="block text-sm text-muted">
                  {DISCIPLINE_LABELS[entry.type]}: {entry.label}, {entry.climbName}
                </span>
              </p>
            ))}
          </div>
          <div className={clsx("flex flex-col gap-2", cardClass("sm", "bordered"))}>
            <span className={EYEBROW_CLASS}>Best day of the week</span>
            {weekday ? (
              <>
                <p className="font-display text-3xl font-semibold">
                  {weekday.best.map((day) => `${WEEKDAY_NAMES[day]}s`).join(" & ")}
                </p>
                <p className="text-sm">
                  {owner ? "You climb" : `${ownerName} climbs`} hardest on{" "}
                  {weekday.best.map((day) => `${WEEKDAY_NAMES[day]}s`).join(" and ")}.
                </p>
                {weekday.ranked.filter((entry) => !weekday.best.includes(entry.weekday)).length >
                  0 && (
                  <ol className="flex flex-col gap-1 text-sm">
                    {weekday.ranked
                      .filter((entry) => !weekday.best.includes(entry.weekday))
                      .slice(0, 2)
                      .map((entry, index) => (
                        <li
                          key={entry.weekday}
                          className="flex justify-between gap-3 border-t border-separator pt-1"
                        >
                          <span>
                            <span className="text-muted">{index + 1 + weekday.best.length}. </span>
                            {WEEKDAY_NAMES[entry.weekday]}s
                          </span>
                          {weekday.grades?.[entry.weekday] && (
                            <span className="text-muted">{weekday.grades[entry.weekday]}</span>
                          )}
                        </li>
                      ))}
                  </ol>
                )}
              </>
            ) : (
              (nudge("Send on more days of the week to see when you climb hardest.") ?? (
                <p className="text-sm text-muted">Not enough days with a send to tell yet.</p>
              ))
            )}
          </div>
        </div>,
      ),
    );
  }

  if (c.boulderRampage) {
    sections.push(
      chapter("boulder-rampage", "Boulder rampage", <DayCard day={c.boulderRampage} />),
    );
  }
  if (c.sportRampage) {
    sections.push(chapter("sport-rampage", "Sport rampage", <DayCard day={c.sportRampage} />));
  }
  if (c.tradRampage) {
    sections.push(chapter("trad-rampage", "Trad rampage", <DayCard day={c.tradRampage} />));
  }

  if (c.homeTurf) {
    const turf = c.homeTurf;
    sections.push(
      chapter(
        "home-turf",
        turf.spread ? `${owner ? "You" : ownerName} got around` : `${whose} home crag`,
        <>
          {turf.spread ? (
            <p className="text-lg">
              {owner ? "You" : ownerName} spread the year around instead of settling on one crag.
            </p>
          ) : (
            <p className="flex flex-col gap-1">
              <span className="font-display text-5xl font-semibold">{turf.place.name}</span>
              <PlaceTrail place={turf.place} />
            </p>
          )}
          <p className="text-sm">
            {turf.spread
              ? `${plural(turf.totalDays, "day")} out around ${turf.place.name}.`
              : `${turf.days} of ${turf.totalDays} days out were here, with ${plural(turf.sends, "send")}.`}
          </p>
          {turf.breakdown.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {turf.breakdown.map((entry) => (
                <li
                  key={entry.name}
                  className="flex justify-between gap-3 border-b border-separator py-1"
                >
                  <span>{entry.name}</span>
                  <span className="text-muted tabular-nums">{plural(entry.days, "day")}</span>
                </li>
              ))}
            </ul>
          )}
        </>,
      ),
    );
  }

  if (c.newGround) {
    const fresh = c.newGround;
    sections.push(
      chapter(
        "new-ground",
        "Exploring new areas",
        <>
          <Hero value={fresh.areas}>new {fresh.areas === 1 ? "area" : "areas"}</Hero>
          <div className="flex flex-col gap-2">
            <span className={EYEBROW_CLASS}>First visits</span>
            <ol className="flex flex-col gap-1 text-sm">
              {fresh.firstVisits.map(({ place, date, days }) => (
                <li
                  key={place.id}
                  className="flex items-baseline justify-between gap-3 border-b border-separator py-1"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{place.name}</span>
                    <span className="truncate text-xs text-muted">
                      {place.trail.slice(0, -1).join(" › ")}
                      {place.trail.length > 1 ? " · " : ""}first day {formatDate(date)}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{plural(days, "day")}</span>
                </li>
              ))}
            </ol>
          </div>
        </>,
      ),
    );
  }

  if (c.trips) {
    const trips = c.trips;
    sections.push(
      chapter(
        "trips",
        `Trips of ${year}`,
        <>
          <p className="text-lg">
            {plural(trips.trips.length, "trip")} · {plural(trips.totalDays, "day")} on the road
          </p>
          {[
            trips.biggest && {
              key: "biggest",
              title: `Biggest trip · ${plural(trips.biggest.climbingDays, "day")}`,
              cards: [trips.biggest],
            },
            trips.returnTrip && {
              key: "return",
              title: `Back to ${trips.returnTrip.trip.location?.name ?? "a favourite"} · ${ordinal(trips.returnTrip.visit)} trip there since ${trips.returnTrip.firstYear}`,
              cards: [trips.returnTrip.trip],
            },
            ...trips.repeatedPlaces.map((group) => ({
              key: `repeat-${group.name}`,
              title: `${group.trips.length} trips to ${group.name} this year`,
              cards: group.trips,
            })),
          ]
            .filter((highlight) => !!highlight)
            .map((highlight) => (
              <div key={highlight.key} className="flex flex-col gap-2">
                <span className={EYEBROW_CLASS}>{highlight.title}</span>
                <TripCards cards={highlight.cards} ownerId={ownerId} owner={owner} />
              </div>
            ))}
        </>,
      ),
    );
  }

  if (c.partner) {
    sections.push(
      chapter(
        "partner",
        "Favourite partner",
        <div className="flex flex-col gap-4">
          <p className="flex flex-col gap-1">
            <AppLink
              href={`/users/${c.partner.partner.id}`}
              className="font-display text-5xl font-semibold"
            >
              {c.partner.partner.name}
            </AppLink>
            <span className="text-muted">{plural(c.partner.days, "day")} out together</span>
          </p>
          {c.partner.runnersUp.length > 0 && (
            <ol className="grid gap-3 sm:grid-cols-2">
              {c.partner.runnersUp.map((entry, index) => (
                <li
                  key={entry.partner.id}
                  className={clsx("flex flex-col gap-0.5", cardClass("sm", "bordered"))}
                >
                  <span className={EYEBROW_CLASS}>#{index + 2}</span>
                  <AppLink
                    href={`/users/${entry.partner.id}`}
                    className="font-display text-2xl font-semibold"
                  >
                    {entry.partner.name}
                  </AppLink>
                  <span className="text-sm text-muted">{plural(entry.days, "day")} together</span>
                </li>
              ))}
            </ol>
          )}
        </div>,
      ),
    );
  }

  if (c.gotAway) {
    const { climbs } = c.gotAway;
    sections.push(
      chapter(
        "got-away",
        climbs.length === 1 ? "Unfinished project" : "Unfinished projects",
        <ol className="flex flex-col gap-3">
          {climbs.map((climb) => (
            <li
              key={climb.climbId}
              className={clsx("flex flex-col gap-1", cardClass("sm", "bordered"))}
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <AppLink
                  href={climbHref(climb.climbId, climb.climbName)}
                  className="font-display text-2xl font-semibold"
                >
                  {climb.climbName}
                </AppLink>
                <span className="font-display text-xl text-muted">{climb.label}</span>
              </span>
              <span className="text-sm text-muted">
                {plural(climb.sessions, "session")} between {formatDate(climb.first)} and{" "}
                {formatDate(climb.last)}, still unsent
              </span>
            </li>
          ))}
        </ol>,
      ),
    );
  }

  if (c.notWorthThePump) {
    sections.push(
      chapter(
        "not-worth-the-pump",
        "Not worth the pump",
        <ul className="flex flex-col gap-3">
          {c.notWorthThePump.climbs.map((climb) => (
            <li
              key={climb.climbId}
              className={clsx("flex flex-col gap-1", cardClass("sm", "bordered"))}
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <AppLink href={climbHref(climb.climbId, climb.climbName)} className="font-semibold">
                  {climb.climbName}
                </AppLink>
                <span className="text-sm text-muted">{climb.label}</span>
                <span aria-label={`${climb.rating} of 5 stars`} className="text-accent">
                  {"★".repeat(climb.rating)}
                  <span className="text-muted">{"☆".repeat(5 - climb.rating)}</span>
                </span>
              </span>
              <PlaceTrail place={climb.place} />
              {climb.othersAverage != null && (
                <span className="text-xs text-muted">
                  {owner ? "You" : ownerName} gave it {climb.rating}★. Everyone else averages{" "}
                  {climb.othersAverage.toFixed(1)}★.
                </span>
              )}
              {climb.comment && (
                <blockquote className="border-l-2 border-separator pl-3 text-sm italic">
                  {climb.comment}
                </blockquote>
              )}
            </li>
          ))}
        </ul>,
      ),
    );
  }

  sections.push(
    chapter(
      "pyramids",
      "Grade pyramids",
      c.pyramids.disciplines.length ? (
        <div className="flex flex-col gap-6">
          {c.pyramids.disciplines.map((entry) => {
            const total = entry.rows.reduce((sum, row) => sum + row.count, 0);
            return (
              <div key={entry.type} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <DisciplineChip type={entry.type} />
                  <span className="text-xs text-muted">{plural(total, "send")}</span>
                </div>
                <VerticalPyramid type={entry.type} rows={entry.rows} marked={entry.marked} />
                {total < 5 && nudge("Log more sends to fill out your pyramid.")}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="mx-auto flex w-48 flex-col items-center gap-1 opacity-40"
          >
            {[30, 55, 80, 100].map((width) => (
              <div
                key={width}
                className="h-3 rounded-xs bg-surface-tertiary"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
          {nudge("Log more sends to fill out your pyramid.")}
        </>
      ),
    ),
  );

  if (c.styles) {
    sections.push(
      chapter(
        "styles",
        "Send breakdown",
        <div className="flex flex-col gap-4">
          {c.styles.disciplines.map((entry) => {
            const segments = [
              { label: "Onsight", value: entry.onsight, className: "bg-(--color-palette-support)" },
              { label: "Flash", value: entry.flash, className: "bg-(--color-palette-primary)" },
              {
                label: "Redpoint",
                value: entry.redpoint,
                className: "bg-(--color-palette-accent)",
              },
            ].filter((segment) => segment.value > 0);
            const total = segments.reduce((sum, segment) => sum + segment.value, 0);
            return (
              <div key={entry.type} className="flex flex-col gap-2">
                <DisciplineChip type={entry.type} />
                <div className="flex h-4 overflow-hidden rounded-full" aria-hidden="true">
                  {segments.map((segment) => (
                    <div
                      key={segment.label}
                      className={segment.className}
                      style={{ width: `${(segment.value / total) * 100}%` }}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted">
                  {segments
                    .map(
                      (segment) => `${segment.label} ${Math.round((segment.value / total) * 100)}%`,
                    )
                    .join(" · ")}
                </p>
              </div>
            );
          })}
        </div>,
      ),
    );
  }

  if (c.newGrades) {
    sections.push(
      chapter(
        "new-grades",
        "New grade unlocked",
        <div className="grid gap-4 md:grid-cols-2">
          {c.newGrades.disciplines.map(({ type, steps, firstYear }) => (
            <div key={type} className="flex flex-col gap-2">
              <DisciplineChip type={type} />
              {firstYear && (
                <p className="text-sm">
                  {whose} first year of {DISCIPLINE_NAMES[type]} went from {firstYear.from} to{" "}
                  {firstYear.to}.
                </p>
              )}
              <ol className="relative flex flex-col gap-3 border-l-2 border-accent/40 pl-4">
                {steps.map((step) => (
                  <li key={`${step.climbId}-${step.date}`} className="flex flex-col">
                    <span className="text-xs text-muted">{formatDate(step.date)}</span>
                    <span>
                      <span className="font-display text-2xl font-semibold">{step.label}</span>{" "}
                      <AppLink
                        href={climbHref(step.climbId, step.climbName)}
                        className="font-medium"
                      >
                        {step.climbName}
                      </AppLink>
                    </span>
                    {step.waitDays != null && (
                      <span className="text-xs text-muted">
                        {step.waitDays < 45
                          ? `${plural(step.waitDays, "day")} after the previous new grade`
                          : `${plural(Math.round(step.waitDays / 30.4), "month")} after the previous new grade`}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>,
      ),
    );
  }

  sections.push(
    chapter(
      "hardest",
      "Hardest sends",
      c.hardest.disciplines.length ? (
        <Rankings disciplines={c.hardest.disciplines} />
      ) : (
        <>
          <Nudge>No sends logged in {year}.</Nudge>
          {owner && c.hardest.undated > 0 && (
            <Nudge>
              {plural(c.hardest.undated, "send")} {c.hardest.undated === 1 ? "has" : "have"} no
              date, so {c.hardest.undated === 1 ? "it isn't" : "they aren't"} in this year. Add the
              date to count {c.hardest.undated === 1 ? "it" : "them"}.
            </Nudge>
          )}
          {owner && (
            <AppLink href={`/users/${ownerId}/sends`} className="text-sm underline">
              Log a send
            </AppLink>
          )}
        </>
      ),
    ),
  );
  if (c.flashes) {
    sections.push(
      chapter("flashes", "Hardest flashes", <Rankings disciplines={c.flashes.disciplines} />),
    );
  }
  if (c.onsights) {
    sections.push(
      chapter("onsights", "Hardest onsights", <Rankings disciplines={c.onsights.disciplines} />),
    );
  }

  return <div className="flex flex-col gap-6">{sections}</div>;
}

/** The owner's "Next year's side quests": every hidden chapter's hint. */
export function YearReviewFootnote({ review, ownerId }: { review: YearReview; ownerId: string }) {
  if (!review.missed.length) return null;
  return (
    <section aria-labelledby="year-side-quests" className="flex flex-col gap-3 px-1">
      <h2 id="year-side-quests" className={EYEBROW_CLASS}>
        Next year&apos;s side quests
      </h2>
      <ul className="flex flex-col gap-2 text-sm text-muted">
        {review.missed.map((item) => (
          <li key={item.id} className={clsx(item.positive && "text-foreground")}>
            {item.positive ? "✓ " : "○ "}
            {item.hint}
          </li>
        ))}
      </ul>
      <AppLink href={`/users/${ownerId}/journal`} className="self-start text-sm underline">
        Open your journal
      </AppLink>
    </section>
  );
}
