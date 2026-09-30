"use client";

import { Button } from "@heroui/react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { MOUNTAIN_PATH } from "@/lib/brand-mark";
import { formatDate } from "@/lib/format-date";
import { OG_DISCIPLINE_COLOR } from "@/lib/og-theme";
import type { RecapSnapshot } from "@/lib/recap-share";
import { socialCardCoverHighlights } from "@/lib/social-card";
import { DISCIPLINE_ORDER } from "@/lib/user-analytics";

type RecapBreakthrough = NonNullable<RecapSnapshot["stats"]["breakthroughs"]>[number];
type RecapFavorite = NonNullable<RecapSnapshot["stats"]["favoriteClimbs"]>[number];

const HEAT_COLORS = ["#dfeae2", "#f8d0c5", "#f3ad9d", "#eb8f77", "#d95e49"];

function RecapBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div role="img" aria-label="Betabook logo" className="flex items-center gap-2">
      <svg
        width={compact ? 32 : 40}
        height={compact ? 32 : 40}
        viewBox="113 -34 264 264"
        aria-hidden
      >
        <path d={MOUNTAIN_PATH} fill="#eaf7ef" />
        <circle cx="312" cy="60" r="14" fill="#ef846c" />
      </svg>
      <span className={`font-display leading-none font-bold ${compact ? "text-xl" : "text-2xl"}`}>
        betabook
      </span>
    </div>
  );
}

function CoverCalendar({ calendar }: { calendar: RecapSnapshot["stats"]["calendar"] }) {
  // oxlint-disable-next-line react/capitalized-calls -- Date.UTC is a JavaScript built-in
  const jan1 = Date.UTC(calendar.year, 0, 1);
  const offset = (new Date(jan1).getUTCDay() + 6) % 7;
  const days = Math.max(
    0,
    Math.round((Date.parse(`${calendar.throughDate}T00:00:00Z`) - jan1) / 86_400_000) + 1,
  );
  const weeks = Math.ceil((offset + days) / 7);
  const max = Math.max(1, ...Object.values(calendar.counts));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold tracking-widest text-black/65 uppercase">
        <span>Climbing days</span>
        <span>{calendar.label}</span>
      </div>
      <div
        className="grid grid-flow-col grid-rows-7 gap-[2px] rounded-xl bg-black/5 p-2"
        style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: weeks * 7 }, (_, index) => {
          const day = index - offset;
          const date =
            day >= 0 && day < days
              ? new Date(jan1 + day * 86_400_000).toISOString().slice(0, 10)
              : null;
          const count = date ? (calendar.counts[date] ?? 0) : 0;
          const level = count > 0 ? Math.max(1, Math.ceil((count / max) * 4)) : 0;
          const color =
            date &&
            count > 0 &&
            calendar.highlightMonth !== null &&
            Number(date.slice(5, 7)) !== calendar.highlightMonth
              ? "#a3c29c"
              : HEAT_COLORS[level];
          return (
            <span
              key={date ?? `empty-${index}`}
              className="h-[clamp(6px,1.05svh,10px)] rounded-[2px]"
              style={{ backgroundColor: date ? color : "transparent" }}
              aria-hidden
            />
          );
        })}
      </div>
    </div>
  );
}

function RecapCoverPage({ snapshot }: { snapshot: RecapSnapshot }) {
  const { stats, owner } = snapshot;
  const singleDiscipline = stats.disciplines.length === 1 ? stats.disciplines[0] : null;
  const heroIsDays = stats.daysOut > 0;
  const value = heroIsDays ? stats.daysOut : stats.sendCount;
  const headline =
    stats.period === "month"
      ? "A MONTH ON THE WALL"
      : stats.period === "year"
        ? "A YEAR ON THE WALL"
        : "THE STORY SO FAR";
  return (
    <div className="flex h-full flex-col overflow-hidden bg-black text-[#eaf7ef]">
      <div className="flex h-[48%] shrink-0 flex-col px-6 pt-14 pb-3">
        <div className="flex items-center justify-between gap-2">
          <RecapBrand />
          <span className="rounded-lg bg-[#ef846c] px-3 py-1 text-xs font-semibold tracking-widest text-black uppercase">
            {stats.periodLabel}
          </span>
        </div>
        <div className="mt-auto">
          <p className="font-display text-[clamp(2rem,6svh,4rem)] leading-none font-bold">
            {headline}
          </p>
          <p
            className="font-display leading-[0.85] font-bold tracking-tight text-[#ef846c] tabular-nums"
            style={{
              fontSize: value >= 1000 ? "clamp(6rem,16svh,10rem)" : "clamp(7rem,20svh,12rem)",
            }}
          >
            {value}
          </p>
          <div className="flex items-center gap-2">
            <span className="font-display text-3xl leading-none font-bold sm:text-4xl">
              {heroIsDays ? "DAYS OUT" : value === 1 ? "SEND" : "SENDS"}
            </span>
            {stats.longestStreak != null && stats.longestStreak > 1 && (
              <span className="rounded-full border border-[#ef846c] px-2 py-1 text-[10px] font-semibold text-[#ef846c]">
                {stats.longestStreak}-DAY STREAK
              </span>
            )}
          </div>
        </div>
        <div className="mt-auto flex items-center gap-2 pt-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-[#ef846c] font-display text-sm font-bold">
            {owner.initials}
          </span>
          <span className="truncate font-display text-xl font-bold">{owner.name}</span>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 bg-black px-3 pt-2 pb-14">
        {stats.disciplines.length ? (
          <div role="group" aria-label="Cover highlights" className="grid grid-cols-3 gap-1.5">
            {singleDiscipline ? (
              <>
                <section
                  aria-label={`${DISCIPLINE_LABELS[singleDiscipline.type]} summary`}
                  className="flex min-w-0 flex-col rounded-xl bg-[#eaf7ef] px-2 py-1.5 text-black"
                >
                  <p
                    className="text-[10px] font-bold tracking-wide uppercase"
                    style={{ color: OG_DISCIPLINE_COLOR[singleDiscipline.type] }}
                  >
                    {DISCIPLINE_LABELS[singleDiscipline.type]}
                  </p>
                  <p className="font-display text-3xl leading-none font-bold tabular-nums sm:text-4xl">
                    {singleDiscipline.sendCount}
                  </p>
                  <p className="mt-auto text-[10px] font-semibold uppercase">
                    {singleDiscipline.sendCount === 1 ? "send" : "sends"}
                  </p>
                </section>
                <section
                  aria-label="Hardest send summary"
                  className="flex min-w-0 flex-col rounded-xl bg-[#eaf7ef] px-2 py-1.5 text-black"
                >
                  <p className="text-[10px] font-bold tracking-wide text-black/65 uppercase">
                    Hardest send
                  </p>
                  <p
                    className="font-display text-3xl leading-none font-bold tabular-nums sm:text-4xl"
                    style={{ color: OG_DISCIPLINE_COLOR[singleDiscipline.type] }}
                  >
                    {singleDiscipline.hardest?.grade ?? "—"}
                  </p>
                  <p className="mt-auto line-clamp-2 text-[10px] leading-tight font-semibold">
                    {singleDiscipline.hardest?.climbName ?? "No grade logged"}
                  </p>
                </section>
              </>
            ) : (
              stats.disciplines.map((discipline) => (
                <section
                  key={discipline.type}
                  aria-label={`${DISCIPLINE_LABELS[discipline.type]} summary`}
                  className="flex min-w-0 flex-col rounded-xl bg-[#eaf7ef] px-2 py-1.5 text-black"
                >
                  <p
                    className="text-[10px] font-bold tracking-wide uppercase"
                    style={{ color: OG_DISCIPLINE_COLOR[discipline.type] }}
                  >
                    {DISCIPLINE_LABELS[discipline.type]}
                  </p>
                  <p className="font-display text-3xl leading-none font-bold tabular-nums sm:text-4xl">
                    {discipline.sendCount}
                  </p>
                  <p className="text-[10px] font-semibold uppercase">
                    {discipline.sendCount === 1 ? "send" : "sends"}
                  </p>
                  {discipline.hardest && (
                    <p
                      className="mt-auto truncate font-display text-lg font-bold sm:text-xl"
                      style={{ color: OG_DISCIPLINE_COLOR[discipline.type] }}
                    >
                      {discipline.hardest.grade}
                    </p>
                  )}
                </section>
              ))
            )}
            {socialCardCoverHighlights(stats).map((highlight) => (
              <section
                key={highlight.id}
                aria-label={`${highlight.label} summary`}
                className="flex min-w-0 flex-col rounded-xl bg-[#eaf7ef] px-2 py-1.5 text-black"
              >
                <p className="text-[10px] font-bold tracking-wide text-black/65 uppercase">
                  {highlight.label}
                </p>
                <p className="font-display text-3xl leading-none font-bold tabular-nums sm:text-4xl">
                  {highlight.value}
                </p>
                <p className="mt-auto line-clamp-2 text-[10px] leading-tight font-semibold">
                  {highlight.detail}
                </p>
              </section>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#eaf7ef]">No sends logged in this period.</p>
        )}
        <section
          aria-label="Climbing days calendar"
          className="mt-auto rounded-xl bg-[#eaf7ef] p-2 text-black"
        >
          <CoverCalendar calendar={stats.calendar} />
        </section>
      </div>
    </div>
  );
}

function BreakthroughCard({ breakthrough }: { breakthrough: RecapBreakthrough }) {
  return (
    <section
      aria-label={`${DISCIPLINE_LABELS[breakthrough.type]} ${breakthrough.grade} breakthrough`}
      className="grid min-h-0 grid-cols-[6.25rem_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-2xl bg-white/80 px-3 py-1"
    >
      <strong
        data-recap-breakthrough-grade
        className="font-display text-[clamp(1.75rem,5svh,2.5rem)] leading-none tabular-nums"
        style={{ color: OG_DISCIPLINE_COLOR[breakthrough.type] }}
      >
        {breakthrough.grade}
      </strong>
      <div data-recap-breakthrough-details className="min-w-0">
        <p className="text-[10px] leading-tight font-semibold tracking-wide uppercase">
          {formatDate(breakthrough.dateSent)}
        </p>
        <p
          data-recap-breakthrough-name
          className="line-clamp-2 font-display text-sm leading-tight font-semibold sm:text-base"
          title={breakthrough.climbName}
        >
          {breakthrough.climbName}
        </p>
      </div>
    </section>
  );
}

function BreakthroughsPage({ breakthroughs }: { breakthroughs: readonly RecapBreakthrough[] }) {
  const groups = DISCIPLINE_ORDER.map((type) => ({
    type,
    entries: breakthroughs.filter((breakthrough) => breakthrough.type === type),
  })).filter(({ entries }) => entries.length > 0);
  const [selectedType, setSelectedType] = useState<RecapBreakthrough["type"]>(
    groups[0]?.type ?? "boulder",
  );
  const [batch, setBatch] = useState(0);
  const active = groups.find(({ type }) => type === selectedType) ?? groups[0];
  if (!active) return null;
  const showAllGroups = breakthroughs.length <= 6;
  const start = batch * 6;
  const visible = active.entries.slice(start, start + 6);
  const batchCount = Math.ceil(active.entries.length / 6);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#eaf7ef] text-black">
      <div
        data-recap-section-header
        className="flex h-[clamp(7rem,18%,8rem)] shrink-0 flex-col overflow-hidden bg-black px-4 pt-14 pb-2 text-[#eaf7ef]"
      >
        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-[#83ba73] uppercase">
              Every new high
            </p>
            <h2 className="font-display text-[clamp(1.6rem,5svh,3rem)] leading-none font-bold">
              Grade breakthroughs
            </h2>
          </div>
          <span className="font-display text-5xl leading-none font-bold text-[#83ba73] tabular-nums">
            {breakthroughs.length}
          </span>
        </div>
      </div>
      {showAllGroups ? (
        <div data-recap-page-body className="flex min-h-0 flex-1 flex-col gap-1 p-2 pb-14">
          {groups.map(({ type, entries }) => (
            <section
              key={type}
              aria-label={`${DISCIPLINE_LABELS[type]} breakthroughs`}
              className="flex min-h-0 flex-col gap-1"
              style={{ flex: entries.length }}
            >
              <div className="flex shrink-0 items-center px-1">
                <h3
                  className="font-display text-sm leading-none font-bold"
                  style={{ color: OG_DISCIPLINE_COLOR[type] }}
                >
                  {DISCIPLINE_LABELS[type]}
                </h3>
              </div>
              <div
                className="grid min-h-0 flex-1 gap-1"
                style={{ gridTemplateRows: `repeat(${entries.length}, minmax(0, 1fr))` }}
              >
                {entries.map((breakthrough) => (
                  <BreakthroughCard
                    key={`${breakthrough.type}-${breakthrough.grade}`}
                    breakthrough={breakthrough}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div data-recap-page-body className="flex min-h-0 flex-1 flex-col gap-2 p-2 pb-14">
          {groups.length > 1 && (
            <div role="group" aria-label="Breakthrough categories" className="flex shrink-0 gap-1">
              {groups.map(({ type, entries }) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={active.type === type}
                  onClick={() => {
                    setSelectedType(type);
                    setBatch(0);
                  }}
                  className={`min-w-0 flex-1 rounded-lg bg-white/80 px-2 py-1 font-display text-base font-bold ${active.type === type ? "ring-2 ring-black/70" : ""}`}
                  style={{ color: OG_DISCIPLINE_COLOR[type] }}
                >
                  {DISCIPLINE_LABELS[type]} · {entries.length}
                </button>
              ))}
            </div>
          )}
          <section
            aria-label={`${DISCIPLINE_LABELS[active.type]} breakthroughs`}
            className="flex min-h-0 flex-1 flex-col gap-1"
          >
            <div className="flex shrink-0 justify-end px-1">
              <span className="text-[10px] text-black/60 tabular-nums">
                {start + 1}–{start + visible.length} of {active.entries.length}
              </span>
            </div>
            <div
              className="grid min-h-0 flex-1 gap-1"
              style={{ gridTemplateRows: `repeat(${visible.length}, minmax(0, 1fr))` }}
            >
              {visible.map((breakthrough) => (
                <BreakthroughCard
                  key={`${breakthrough.type}-${breakthrough.grade}`}
                  breakthrough={breakthrough}
                />
              ))}
            </div>
            {batchCount > 1 && (
              <div className="flex shrink-0 justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-black"
                  isDisabled={batch === 0}
                  onPress={() => setBatch((page) => page - 1)}
                >
                  Newer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-black"
                  isDisabled={batch === batchCount - 1}
                  onPress={() => setBatch((page) => page + 1)}
                >
                  Older
                </Button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function RecapSectionHeader({
  eyebrow,
  title,
  count,
}: {
  eyebrow: string;
  title: string;
  count: number;
}) {
  return (
    <div
      data-recap-section-header
      className="flex h-[clamp(7rem,18%,8rem)] shrink-0 flex-col overflow-hidden bg-black px-4 pt-14 pb-2 text-[#eaf7ef]"
    >
      <div className="mt-auto flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.18em] text-[#83ba73] uppercase">
            {eyebrow}
          </p>
          <h2 className="font-display text-[clamp(1.6rem,5svh,3rem)] leading-none font-bold">
            {title}
          </h2>
        </div>
        <span className="font-display text-5xl leading-none font-bold text-[#83ba73] tabular-nums">
          {count}
        </span>
      </div>
    </div>
  );
}

function HighlightsPage({
  highlights,
}: {
  highlights: NonNullable<RecapSnapshot["stats"]["highlights"]>;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#eaf7ef] text-black">
      <RecapSectionHeader
        eyebrow="Beyond the sends"
        title="Climbing highlights"
        count={highlights.length}
      />
      <div data-recap-page-body className="grid min-h-0 flex-1 grid-cols-2 gap-2 p-2 pb-14">
        {highlights.map((highlight) => (
          <section
            key={highlight.id}
            aria-label={highlight.label}
            className="flex min-h-0 flex-col justify-between overflow-hidden rounded-2xl bg-white/80 p-3"
          >
            <h3 className="text-[10px] font-bold tracking-wide text-black/60 uppercase">
              {highlight.label}
            </h3>
            <p className="line-clamp-3 font-display text-[clamp(1.25rem,4svh,2rem)] leading-tight font-bold">
              {highlight.value}
            </p>
            <p className="text-xs font-semibold text-black/65">{highlight.detail}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

function FavoriteClimbsPage({ favorites }: { favorites: readonly RecapFavorite[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#eaf7ef] text-black">
      <RecapSectionHeader
        eyebrow="Worth another lap"
        title="Favorite climbs"
        count={favorites.length}
      />
      <ol
        data-recap-page-body
        aria-label="Highest rated climbs"
        className="grid min-h-0 flex-1 gap-1.5 p-2 pb-14"
        style={{ gridTemplateRows: `repeat(${favorites.length}, minmax(0, 1fr))` }}
      >
        {favorites.map((favorite, index) => (
          <li
            key={favorite.climbId}
            className="grid min-h-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-2xl bg-white/80 px-3 py-1"
          >
            <span
              className="font-display text-xl font-bold tabular-nums"
              style={{ color: OG_DISCIPLINE_COLOR[favorite.type] }}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 font-display text-base leading-tight font-semibold">
                {favorite.climbName}
              </p>
              <p
                className="text-[10px] font-bold tracking-wide uppercase"
                style={{ color: OG_DISCIPLINE_COLOR[favorite.type] }}
              >
                {DISCIPLINE_LABELS[favorite.type]}
                {favorite.grade ? ` · ${favorite.grade}` : ""}
              </p>
            </div>
            <span
              aria-label={`Rated ${favorite.rating} out of 5 stars`}
              className="flex items-center gap-1 text-sm font-semibold"
            >
              {favorite.rating}
              <Star aria-hidden className="size-4 fill-current text-warning" />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The social app gets one PNG; the link opens responsive full-screen pages. */
export function RecapStory({
  snapshot,
  profilePath,
  initialPage = 0,
}: {
  snapshot: RecapSnapshot;
  profilePath: string;
  initialPage?: number;
}) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState(initialPage);
  const breakthroughs = snapshot.stats.breakthroughs ?? [];
  const highlights = snapshot.stats.highlights ?? [];
  const favoriteClimbs =
    snapshot.stats.favoriteClimbs ??
    snapshot.stats.disciplines
      .flatMap((discipline) =>
        discipline.favorites.map((favorite) => ({ ...favorite, type: discipline.type })),
      )
      .toSorted((a, b) => b.rating - a.rating || a.climbName.localeCompare(b.climbName))
      .slice(0, 6);
  const pageKeys = [
    "cover",
    ...(breakthroughs.length ? ["breakthroughs"] : []),
    ...(highlights.length ? ["highlights"] : []),
    ...(favoriteClimbs.length ? ["favorites"] : []),
  ];
  const pageCount = pageKeys.length;
  const currentPage = pageKeys[current];

  useEffect(() => {
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, []);

  function goTo(index: number) {
    if (index < 0 || index >= pageCount) return;
    setCurrent(index);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#07100b] text-[#eaf7ef]">
      <div className="relative mx-auto h-svh w-full overflow-hidden bg-black md:w-[56.25svh]">
        <div
          role="region"
          aria-label="Recap pages"
          className="h-full"
          onTouchStart={(event) => {
            touchStart.current = {
              x: event.changedTouches[0].clientX,
              y: event.changedTouches[0].clientY,
            };
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start) return;
            const dx = event.changedTouches[0].clientX - start.x;
            const dy = event.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              goTo(current + (dx < 0 ? 1 : -1));
            }
          }}
        >
          {currentPage === "cover" ? (
            <section aria-label="Cover" className="h-full">
              <RecapCoverPage snapshot={snapshot} />
            </section>
          ) : currentPage === "breakthroughs" ? (
            <section aria-label="Grade breakthroughs recap" className="h-full">
              <BreakthroughsPage breakthroughs={breakthroughs} />
            </section>
          ) : currentPage === "highlights" ? (
            <section aria-label="Analytics highlights recap" className="h-full">
              <HighlightsPage highlights={highlights} />
            </section>
          ) : currentPage === "favorites" ? (
            <section aria-label="Favorite climbs recap" className="h-full">
              <FavoriteClimbsPage favorites={favoriteClimbs} />
            </section>
          ) : null}
        </div>
        <div
          data-recap-top-navigation
          className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-linear-to-b from-black/80 to-transparent px-3 pt-2 pb-7"
        >
          <div className="flex gap-1" aria-hidden>
            {pageKeys.map((key, index) => (
              <span
                key={key}
                className="h-1 flex-1 rounded-full"
                style={{ backgroundColor: index <= current ? "#ef846c" : "#5f7365" }}
              />
            ))}
          </div>
          <div className="pointer-events-auto mt-2 flex items-center justify-between gap-2">
            <AppLink
              href={profilePath}
              aria-label="Close recap and view profile"
              className="flex items-center gap-0.5 text-xs text-[#eaf7ef]"
            >
              <ChevronLeft aria-hidden className="size-4" />
              Profile
            </AppLink>
            <h1 className="min-w-0 truncate font-display text-lg font-bold">
              {snapshot.owner.name}&apos;s recap
            </h1>
            <span className="w-12 shrink-0" aria-hidden />
          </div>
        </div>
        <div
          data-recap-bottom-navigation
          className="absolute inset-x-0 bottom-0 z-20 flex h-14 items-center justify-between bg-linear-to-t from-black/85 to-transparent px-3"
        >
          <Button
            isIconOnly
            variant="outline"
            className="border-white/60 bg-black/30 text-[#eaf7ef]"
            onPress={() => goTo(current - 1)}
            isDisabled={current === 0}
            aria-label="Previous recap page"
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <span
            className="text-center text-xs font-semibold tracking-wide text-[#eaf7ef]"
            aria-live="polite"
          >
            {current + 1} / {pageCount} ·{" "}
            {currentPage === "cover"
              ? "Cover"
              : currentPage === "breakthroughs"
                ? "Breakthroughs"
                : currentPage === "highlights"
                  ? "Highlights"
                  : currentPage === "favorites"
                    ? "Favorites"
                    : ""}
          </span>
          <Button
            isIconOnly
            variant="outline"
            className="border-white/60 bg-black/30 text-[#eaf7ef]"
            onPress={() => goTo(current + 1)}
            isDisabled={current === pageCount - 1}
            aria-label="Next recap page"
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
