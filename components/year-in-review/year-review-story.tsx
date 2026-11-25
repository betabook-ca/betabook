import { clsx } from "clsx";
import type { ReactNode } from "react";

import { StatTiles } from "@/components/analytics-stat-tiles";
import { AscentStyle } from "@/components/ascent-style";
import { AppLink } from "@/components/ui/app-link";
import { cardClass } from "@/components/ui/card";
import { DISCIPLINE_LABELS, DisciplineChip } from "@/components/ui/discipline-chip";
import { EYEBROW_CLASS } from "@/components/ui/eyebrow";
import { BarStrip } from "@/components/year-in-review/bar-strip";
import { ChapterShareImage } from "@/components/year-in-review/chapter-share-image";
import { CountUp } from "@/components/year-in-review/count-up";
import { VerticalPyramid } from "@/components/year-in-review/vertical-pyramid";
import { formatDate } from "@/lib/format-date";
import type { ShareImageContent, ShareImageStat } from "@/lib/share-image";
import { climbHref } from "@/lib/slug";
import { tripHref } from "@/lib/trips";
import {
  DISCIPLINE_NAMES,
  monthName,
  WEEKDAY_NAMES,
  type DayHighlight,
  type DisciplineRanking,
  type YearChapterId,
  type YearPlace,
  type YearReview,
} from "@/lib/year-in-review";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const NO_CARDS: Partial<Record<YearChapterId, ShareImageContent<ShareImageStat>>> = {};

type YearReviewStoryMode =
  /** The owner's page: share images, logging links and the footnote. */
  | "owner"
  /** A link: the same recap without the owner's actions or tagged partners. */
  | "shared";

type StoryProps = {
  review: YearReview;
  ownerId: string;
  ownerName: string;
  mode: YearReviewStoryMode;
  shareCards?: Partial<Record<YearChapterId, ShareImageContent<ShareImageStat>>>;
};

function Chapter({
  id,
  title,
  children,
  share,
  ownerName,
  year,
}: {
  id: YearChapterId;
  title: string;
  children: ReactNode;
  share?: ShareImageContent<ShareImageStat>;
  ownerName: string;
  year: number;
}) {
  const headingId = `year-chapter-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      className={clsx(
        "flex min-h-[70svh] flex-col justify-center gap-5 md:min-h-0",
        cardClass("fluid"),
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="font-display text-3xl font-semibold tracking-tight">
          {title}
        </h2>
        {share && <ChapterShareImage content={share} fileName={`${ownerName} ${year} ${title}`} />}
      </header>
      {children}
    </section>
  );
}

function Hero({ value, children }: { value: number; children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3">
      <CountUp value={value} className="font-display text-7xl font-semibold tabular-nums" />
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

function DayCard({ day, title }: { day: DayHighlight; title: string }) {
  const where = day.place ? day.place.name : day.roots.join(" + ");
  return (
    <div className={clsx("flex flex-col gap-2", cardClass("sm", "bordered"))}>
      <span className={EYEBROW_CLASS}>{title}</span>
      <p className="font-semibold">
        {formatDate(day.date)}
        {where ? ` · ${day.roots.length ? `across ${where}` : where}` : ""}
      </p>
      <p className="text-sm">
        {plural(day.climbs, "climb")} tried · {plural(day.sends, "send")}
        {day.hardest ? ` · hardest ${day.hardest.label} (${day.hardest.climbName})` : ""}
      </p>
      <ul className="flex flex-wrap gap-1.5 text-xs">
        {day.list.slice(0, 12).map((climb) => (
          <li
            key={climb.climbId}
            className={clsx(
              "rounded-full px-2 py-0.5",
              climb.sent ? "bg-accent/20 font-medium" : "bg-surface-tertiary text-muted",
            )}
          >
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

/** Every chapter, top to bottom: the four core chapters always, the rest
 * when earned. */
// oxlint-disable-next-line max-lines-per-function, complexity -- one long page of independent chapters
export function YearReviewStory({
  review,
  ownerId,
  ownerName,
  mode,
  shareCards = NO_CARDS,
}: StoryProps) {
  const { year, chapters: c } = review;
  const owner = mode === "owner";
  const cards = owner ? shareCards : {};
  const chapter = (id: YearChapterId, title: string, body: ReactNode) => {
    return (
      <Chapter key={id} id={id} title={title} share={cards[id]} ownerName={ownerName} year={year}>
        {body}
      </Chapter>
    );
  };
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
          className="grid-cols-2 sm:grid-cols-3"
          tiles={[
            { label: "Days out", value: c.intro.daysOut },
            { label: "Sends", value: c.intro.sends },
            { label: "Areas visited", value: c.intro.areasVisited },
          ]}
        />
      ) : (
        <>
          <Nudge>Nothing logged in {year} yet.</Nudge>
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
            <Nudge>Log your sessions to see your year take shape.</Nudge>
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
        "Your climbing calendar",
        <div className="grid gap-4 md:grid-cols-3">
          <div className={clsx("flex flex-col gap-2", cardClass("sm", "bordered"))}>
            <span className={EYEBROW_CLASS}>Peak month</span>
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
            <span className={EYEBROW_CLASS}>Hardest-send month</span>
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
            <span className={EYEBROW_CLASS}>Peak-performance weekday</span>
            {weekday ? (
              <>
                <p className="font-display text-3xl font-semibold">
                  {weekday.best.map((day) => `${WEEKDAY_NAMES[day]}s`).join(" & ")}
                </p>
                <p className="text-sm text-muted">
                  Your best {WEEKDAY_NAMES[weekday.best[0]]} send is typically in the top{" "}
                  {weekday.topPercent}% of your year.
                </p>
                <BarStrip
                  values={weekday.scores.map((score) => (score == null ? null : Math.round(score)))}
                  labels={WEEKDAY_LABELS}
                  highlight={weekday.best}
                  summary="Average best-of-day relative grade by weekday"
                  valueLabels={weekday.grades ?? undefined}
                />
              </>
            ) : (
              <Nudge>Log sends on more weekdays to see when you climb your best.</Nudge>
            )}
          </div>
        </div>,
      ),
    );
  }

  if (c.biggestDay) {
    const { biggestDay, rampage, sameDay } = c.biggestDay;
    sections.push(
      chapter(
        "biggest-day",
        sameDay ? "Your biggest day was also your biggest rampage" : "Biggest days",
        // Two cards share the row; one card (the same day, or only one of
        // the two earned) takes the whole width.
        <div className={clsx("grid gap-4", biggestDay && rampage && !sameDay && "md:grid-cols-2")}>
          {biggestDay && (
            <DayCard day={biggestDay} title={sameDay ? "Biggest day and rampage" : "Biggest day"} />
          )}
          {rampage && !sameDay && <DayCard day={rampage} title="Biggest rampage" />}
        </div>,
      ),
    );
  }

  if (c.homeTurf) {
    const turf = c.homeTurf;
    sections.push(
      chapter(
        "home-turf",
        turf.spread ? "You got around" : "Your home crag",
        <>
          {turf.spread ? (
            <p className="text-lg">No single place held most of your days.</p>
          ) : (
            <p className="flex flex-col gap-1">
              <span className="font-display text-5xl font-semibold">{turf.place.name}</span>
              <PlaceTrail place={turf.place} />
            </p>
          )}
          <p className="text-sm">
            {turf.spread
              ? `${plural(turf.totalDays, "day")} across ${turf.place.name}.`
              : `${turf.days} of your ${turf.totalDays} days · ${plural(turf.sends, "send")} there.`}
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
        "New ground",
        <>
          <Hero value={fresh.days}>
            {fresh.days === 1 ? "day" : "days"} at {plural(fresh.areas, "area")} you&apos;d never
            climbed before
          </Hero>
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
                      {place.trail.length > 1 ? " · " : ""}first visit {formatDate(date)}
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
            {plural(trips.trips.length, "trip")} · {plural(trips.totalDays, "day")} on the road ·{" "}
            {Math.round(trips.shareOfDays * 100)}% of your days out
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            {trips.biggest && (
              <span className="rounded-full bg-accent/20 px-3 py-1">
                Biggest trip: {trips.biggest.name} ({plural(trips.biggest.climbingDays, "day")})
              </span>
            )}
            {trips.returnTrip && (
              <span className="rounded-full bg-surface-tertiary px-3 py-1">
                Back to {trips.returnTrip.trip.location?.name}: trip #{trips.returnTrip.visit} there
                (first in {trips.returnTrip.firstYear})
              </span>
            )}
            {trips.repeatedPlaces.map((group) => (
              <span key={group.name} className="rounded-full bg-surface-tertiary px-3 py-1">
                {group.count} trips to {group.name} this year
              </span>
            ))}
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {trips.trips.map((trip) => (
              <li
                key={trip.id}
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
        </>,
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
                  Your first year of {DISCIPLINE_NAMES[type]}: from {firstYear.from} to{" "}
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
                          ? `${plural(step.waitDays, "day")} after your last step up`
                          : `${Math.round(step.waitDays / 30.4)} months after your last step up`}
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
          {c.hardest.undated > 0 && (
            <Nudge>
              {plural(c.hardest.undated, "send")} {c.hardest.undated === 1 ? "has" : "have"} no date
              and aren&apos;t counted. Add dates to include them.
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
  // Flashes and onsights share one card: both are first-try ascents.
  if (c.flashes || c.onsights) {
    const groups = [
      { title: "Flashes", ranking: c.flashes },
      { title: "Onsights", ranking: c.onsights },
    ].flatMap(({ title, ranking }) =>
      ranking ? [{ title, disciplines: ranking.disciplines }] : [],
    );
    sections.push(
      chapter(
        "flashes",
        c.flashes && c.onsights
          ? "Hardest flashes and onsights"
          : c.flashes
            ? "Hardest flashes"
            : "Hardest onsights",
        <div className="flex flex-col gap-6">
          {groups.map(({ title, disciplines }) => (
            <div key={title} className="flex flex-col gap-3">
              {groups.length > 1 && <span className={EYEBROW_CLASS}>{title}</span>}
              <Rankings disciplines={disciplines} />
            </div>
          ))}
        </div>,
      ),
    );
  }

  if (c.styles) {
    sections.push(
      chapter(
        "styles",
        "How you sent it",
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
              { label: "Repeat", value: entry.repeat, className: "bg-surface-tertiary" },
            ].filter((segment) => segment.value > 0);
            const total = segments.reduce((sum, segment) => sum + segment.value, 0);
            return (
              <div key={entry.type} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <DisciplineChip type={entry.type} />
                  <span className="text-sm">
                    {Math.round(entry.firstTryRate * 100)}% of your {DISCIPLINE_NAMES[entry.type]}{" "}
                    went first try
                  </span>
                </div>
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
                  {segments.map((segment) => `${segment.label} ${segment.value}`).join(" · ")}
                  {entry.repeat > 0 ? " (repeats counted from your journal)" : ""}
                </p>
              </div>
            );
          })}
        </div>,
      ),
    );
  }

  sections.push(
    chapter(
      "pyramids",
      "Grade pyramids",
      c.pyramids.disciplines.some((entry) => entry.rows.length) ? (
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
                {(total < 5 || entry.rows.length < 2) && (
                  <Nudge>Log more sends to fill out your pyramid.</Nudge>
                )}
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
          <Nudge>Log more sends to fill out your pyramid.</Nudge>
        </>
      ),
    ),
  );

  if (c.partner && owner) {
    sections.push(
      chapter(
        "partner",
        "Favourite partner",
        <p className="flex flex-col gap-1">
          <AppLink
            href={`/users/${c.partner.partner.id}`}
            className="font-display text-5xl font-semibold"
          >
            {c.partner.partner.name}
          </AppLink>
          <span className="text-muted">{plural(c.partner.days, "day")} out together</span>
        </p>,
      ),
    );
  }

  if (c.gotAway) {
    const { climbs } = c.gotAway;
    sections.push(
      chapter(
        "got-away",
        climbs.length === 1 ? "The one that got away" : "The ones that got away",
        <>
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
                  {plural(climb.sessions, "session")}, from {formatDate(climb.first)} to{" "}
                  {formatDate(climb.last)}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-muted">Next year.</p>
        </>,
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
                  You: {climb.rating}★ · Everyone else: {climb.othersAverage.toFixed(1)}★
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

  if (c.personas?.personas.length) {
    const [top, ...rest] = c.personas.personas;
    sections.push(
      chapter(
        "personas",
        owner ? "Your climbing personas" : `${ownerName}'s climbing personas`,
        <div className="flex flex-col gap-4">
          <div className={clsx("flex flex-col gap-2", cardClass("md", "accent"))}>
            <span className="text-xs font-medium tracking-widest uppercase opacity-80">#1</span>
            <p className="font-display text-5xl font-semibold">{top.name}</p>
            <p>{top.why}</p>
          </div>
          {rest.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {rest.map((persona, index) => (
                <div
                  key={persona.id}
                  className={clsx("flex flex-col gap-1", cardClass("sm", "bordered"))}
                >
                  <span className={EYEBROW_CLASS}>#{index + 2} · with a side of</span>
                  <p className="font-display text-2xl font-semibold">{persona.name}</p>
                  <p className="text-sm text-muted">{persona.why}</p>
                </div>
              ))}
            </div>
          )}
        </div>,
      ),
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
