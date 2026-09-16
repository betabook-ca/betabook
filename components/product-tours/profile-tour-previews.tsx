"use client";

import { Button } from "@heroui/react";
import { useState } from "react";

import { StatTiles } from "@/components/analytics-stat-tiles";
import { AscentStyle } from "@/components/ascent-style";
import { FilterInput } from "@/components/filters/filter-input";
import { JournalEntryLayout, JournalEntryStatus } from "@/components/journal/journal-entry-layout";
import { ProjectCardLayout } from "@/components/journal/project-card-layout";
import { ProjectSessionList } from "@/components/journal/project-session-list";
import { PrivacyFields } from "@/components/privacy-fields";
import { ProgressionChart } from "@/components/progression-chart";
import { SendGradeCell } from "@/components/send-grade-cell";
import { cardClass } from "@/components/ui/card";
import { choicePillClass } from "@/components/ui/choice-pill";
import { FILTER_PILL_CLASS } from "@/components/ui/field";
import { Grade } from "@/components/ui/grade";
import { ListRow } from "@/components/ui/list-row";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { SettingsSection } from "@/components/ui/settings";
import { SortSelect } from "@/components/ui/sort-select";
import { formatDate } from "@/lib/format-date";
import { formatActivityGrade, parseGrade } from "@/lib/grades";
import type { SendCommentAudience, SharingAudience } from "@/lib/privacy";
import {
  getTourDemoJournalPage,
  TOUR_DEMO_ANALYTICS,
  TOUR_DEMO_ENTRIES,
  TOUR_DEMO_PROJECT,
  TOUR_DEMO_SENDS,
  TOUR_DEMO_SEARCH_RESULTS,
} from "@/lib/product-tour-demo";

function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          className={`${choicePillClass(value === option, "bg-foreground text-background")} ${FILTER_PILL_CLASS}`}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function DemoJournal() {
  const [view, setView] = useState<"All" | "Sessions" | "Training">("All");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { matches, visible } = getTourDemoJournalPage({
    kind: view === "All" ? null : view === "Sessions" ? "session" : "training",
    query,
    tag,
    showAll,
  });
  function toggleTag(next: string) {
    setTag(tag === next ? null : next);
    setShowAll(false);
  }
  return (
    <div className="flex flex-col gap-4">
      <div data-tour-target="journal-filters" className="flex flex-col gap-2">
        <FilterInput
          label="Filter Alex's journal"
          placeholder="Filter journal…"
          value={query}
          onChange={(next) => {
            setQuery(next);
            setShowAll(false);
          }}
        />
        <Choices
          label="Journal entry type"
          options={["All", "Sessions", "Training"]}
          value={view}
          onChange={(next) => {
            setView(next);
            setShowAll(false);
          }}
        />
      </div>
      {tag && (
        <button
          type="button"
          className="self-start text-xs underline focus-visible:status-focused"
          onClick={() => {
            setTag(null);
            setShowAll(false);
          }}
        >
          Clear #{tag} filter
        </button>
      )}
      <p role="status" className="text-xs text-muted">
        {view === "Training" && tag === "footwork" && matches.length === 1
          ? "One gym workout matches."
          : `Showing ${visible.length} of ${matches.length} matching entries`}
      </p>
      <div className="divide-y divide-separator">
        {visible.map((entry) => (
          <JournalEntryLayout
            key={entry.id}
            title={entry.climb?.name ?? "Training"}
            date={entry.date}
            location={entry.climb ? TOUR_DEMO_SEARCH_RESULTS.area.name : undefined}
            status={
              entry.kind === "training" ? (
                "Training"
              ) : (
                <JournalEntryStatus
                  isAscent={entry.outcome === "Sent"}
                  sent={entry.outcome === "Repeat" || entry.outcome === "Sent"}
                />
              )
            }
            grade={
              entry.climb && (entry.outcome === "Sent" || entry.outcome === "Repeat") ? (
                <Grade>
                  <span title="Posted grade">
                    {formatActivityGrade("boulder", parseGrade("boulder", entry.climb.grade), true)}
                  </span>
                </Grade>
              ) : undefined
            }
            comment={entry.note}
            tags={
              entry.tags.length > 0
                ? entry.tags.map((entryTag) => (
                    <button
                      key={entryTag}
                      type="button"
                      aria-pressed={tag === entryTag}
                      aria-label={`Filter example journal by ${entryTag}`}
                      onClick={() => toggleTag(entryTag)}
                      className={`cursor-pointer text-xs transition-colors hover:text-foreground focus-visible:status-focused ${tag === entryTag ? "font-medium text-foreground underline underline-offset-4" : "text-muted"}`}
                    >
                      #{entryTag}
                    </button>
                  ))
                : undefined
            }
          />
        ))}
      </div>
      {matches.length > 3 && (
        <Button
          variant="ghost"
          className="self-start"
          onPress={() => setShowAll(!showAll)}
          aria-expanded={showAll}
        >
          {showAll ? "Show fewer entries" : `Show all ${matches.length} entries`}
        </Button>
      )}
      {matches.length === 0 && (
        <p className="text-sm">No matching entries. Clear a filter to see more.</p>
      )}
    </div>
  );
}

export function DemoSends() {
  const [sort, setSort] = useState("date_desc");
  const [field, direction] = sort.split("_");
  const sends = [...TOUR_DEMO_SENDS].sort((a, b) => {
    const comparison =
      field === "grade"
        ? a.suggestedGrade - b.suggestedGrade
        : field === "rating"
          ? a.rating - b.rating
          : a.dateSent.localeCompare(b.dateSent);
    return direction === "asc" ? comparison : -comparison;
  });
  const sortDescription =
    field === "date"
      ? direction === "asc"
        ? "Oldest first"
        : "Newest first"
      : field === "grade"
        ? direction === "asc"
          ? "Easiest first"
          : "Hardest first"
        : direction === "asc"
          ? "Lowest rated first"
          : "Highest rated first";
  return (
    <div className="flex flex-col gap-4">
      <div data-tour-target="send-sort">
        <SortSelect
          sort={sort}
          fields={[
            { id: "date", label: "Date" },
            { id: "grade", label: "Grade" },
            { id: "rating", label: "Rating" },
          ]}
          defaultField="date"
          defaultDirection={{ date: "desc", grade: "desc", rating: "desc" }}
          onNavigate={setSort}
        />
      </div>
      <p role="status" className="text-xs text-muted">
        {sortDescription}
      </p>
      <div className="divide-y divide-separator">
        {sends.map((send) => (
          <ListRow
            key={send.climbId}
            title={send.climbName}
            subtitle={send.areaName}
            comment={send.note}
            trailing={
              <div className="flex flex-col items-end gap-1 text-sm">
                <SendGradeCell
                  type={send.climbType}
                  grade={send.suggestedGrade}
                  gradeFeel="solid"
                  rating={send.rating}
                />
                <AscentStyle type={send.ascentStyle} />
                <time dateTime={send.dateSent} className="text-xs text-muted">
                  {formatDate(send.dateSent)}
                </time>
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

export function DemoProjects() {
  const [showAll, setShowAll] = useState(false);
  const sessions = TOUR_DEMO_PROJECT.sessions;
  const latest = sessions[0];
  const project = {
    climbName: TOUR_DEMO_PROJECT.name,
    climbType: "boulder" as const,
    climbGrade: parseGrade("boulder", TOUR_DEMO_PROJECT.grade),
    areaName: TOUR_DEMO_SEARCH_RESULTS.area.name,
    sessionCount: sessions.length,
    firstSession: sessions[sessions.length - 1].date,
    lastSession: latest.date,
  };
  const notes = (showAll ? sessions : sessions.slice(0, 1)).map((entry, index) => ({
    id: -(index + 1),
    entryDate: entry.date,
    tags: entry.tags,
    body: entry.note,
  }));
  return (
    <ProjectCardLayout project={project} today={latest.date}>
      <div data-tour-target="project-sessions" className="flex flex-col gap-4">
        <ProjectSessionList sessions={notes} />
        {!showAll && <LoadMoreButton onPress={() => setShowAll(true)} loading={false} />}
      </div>
    </ProjectCardLayout>
  );
}

export function DemoAnalytics() {
  const [showDay, setShowDay] = useState(false);
  const analytics = TOUR_DEMO_ANALYTICS;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <StatTiles
        className="grid-cols-3"
        tiles={[
          { label: "Sends", value: analytics.sendCount },
          { label: "Days out", value: analytics.daysOut },
          { label: "Hardest", value: analytics.hardest[0].label },
        ]}
      />
      <div data-tour-target="analytics-chart">
        <h3 className="mb-2 text-sm font-medium">Boulder progression</h3>
        <ProgressionChart
          type="boulder"
          points={analytics.progression[0].points}
          sends={TOUR_DEMO_SENDS}
        />
      </div>
      <Button
        variant="secondary"
        aria-expanded={showDay}
        aria-controls="demo-analytics-day"
        onPress={() => setShowDay(!showDay)}
      >
        {showDay ? "Hide March 12" : "Why is March 12 only one day out?"}
      </Button>
      <div id="demo-analytics-day" hidden={!showDay}>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {TOUR_DEMO_ENTRIES.filter((entry) => entry.date === "2026-03-12").map((entry) => (
            <li key={entry.id}>
              {entry.climb?.name} · {entry.outcome}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">Three climbs on March 12 count as one day out.</p>
      </div>
    </div>
  );
}

const DEMO_AUDIENCE_READERS: Record<SendCommentAudience, string> = {
  private: "only Alex",
  friends: "Alex and friends",
  public: "signed-in members",
  everyone: "everyone, including signed-out visitors",
};

export function DemoAccount() {
  const [isPrivate, setIsPrivate] = useState(false);
  const [journalVisibility, setJournalVisibility] = useState<SharingAudience>("friends");
  const [sendCommentVisibility, setSendCommentVisibility] = useState<SendCommentAudience>("public");
  return (
    <div className="flex flex-col gap-4">
      <SettingsSection id="demo-privacy" title="Privacy" layout="stacked">
        <div data-tour-target="privacy-controls">
          <PrivacyFields
            isPrivate={isPrivate}
            journalVisibility={journalVisibility}
            sendCommentVisibility={sendCommentVisibility}
            onProfileChange={setIsPrivate}
            onJournalChange={setJournalVisibility}
            onSendCommentChange={setSendCommentVisibility}
          />
        </div>
      </SettingsSection>
      <div role="status" className={`text-sm ${cardClass("sm")}`}>
        <p className="font-medium">What a signed-in member can see</p>
        {isPrivate ? (
          <p className="mt-1">
            Only Alex can see this profile and climbing history. Climb pages list Alex’s sends
            without a name.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            <li>Profile and send details: signed-in members.</li>
            <li>Send commentary: {DEMO_AUDIENCE_READERS[sendCommentVisibility]}.</li>
            <li>Journal and goals: {DEMO_AUDIENCE_READERS[journalVisibility]}.</li>
          </ul>
        )}
      </div>
    </div>
  );
}
