"use client";

import { Button, buttonVariants } from "@heroui/react";
import { useState } from "react";

import { FeedActivityCard } from "@/components/feed-activity-card";
import { GoalCompletionNotice } from "@/components/goals/goal-completion-notice";
import { GoalDate, GOAL_ROW_CLASS } from "@/components/goals/goal-date";
import { GoalForm, type GoalDraft } from "@/components/goals/goal-form";
import { GoalSection } from "@/components/goals/goal-section";
import type { ProductTourPageProps } from "@/components/product-tours/types";
import { AppLink } from "@/components/ui/app-link";
import { ListRow } from "@/components/ui/list-row";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionNavigation } from "@/components/ui/section-navigation";
import { goalInputSchema, goalTitle } from "@/lib/goals";
import {
  getTourDemoGoalProgress,
  TOUR_DEMO_GOAL,
  TOUR_DEMO_GOAL_FEED,
} from "@/lib/product-tour-demo";

function DemoGoalEditor({ withTags }: { withTags: boolean }) {
  const [saved, setSaved] = useState<string | null>(null);
  const draft: GoalDraft = {
    category: "training",
    goal: "training",
    discipline: "boulder",
    grade: "any",
    amount: "2",
    period: "month",
    endDate: "2026-03-31",
    repeat: "none",
    tags: withTags ? TOUR_DEMO_GOAL.tags : [],
  };
  return (
    <div className="flex flex-col gap-3">
      <GoalForm
        headingLevel={2}
        initialValues={draft}
        today="2026-03-14"
        onSave={(value) => {
          const climbing = value.goal === "volume" || value.goal === "grade";
          const result = goalInputSchema.safeParse({
            kind: value.goal,
            target: Number(value.amount),
            discipline: climbing ? value.discipline : null,
            grade: climbing && value.grade !== "any" ? Number(value.grade) : null,
            gradeMatch: value.gradeMatch,
            tags: value.tags,
            timeframe: value.period,
            startDate: value.startDate,
            endDate: value.endDate,
            repeat: value.repeat,
            timezone: "UTC",
          });
          if (!result.success)
            throw new Error(result.error.issues[0]?.message ?? "Check your example goal.");
          setSaved(goalTitle(result.data));
        }}
      />
      {saved && (
        <p role="status" className="text-sm text-muted">
          Example saved: {saved}
        </p>
      )}
    </div>
  );
}

function DemoGoalLifecycle({
  finished,
  href,
}: {
  finished: boolean;
  href: ProductTourPageProps["href"];
}) {
  const [entries, setEntries] = useState(() =>
    finished
      ? [1, 2].map((id) => ({ id, tags: ["hangboard", "strength"] }))
      : ([] as { id: number; tags: string[] }[]),
  );
  const [archived, setArchived] = useState(false);
  const [view, setView] = useState<"active" | "history">("active");
  const goal = getTourDemoGoalProgress(entries);
  const complete = Boolean(goal.completedDate);
  const showGoal = view === "active" ? !archived : complete;
  return (
    <div className="flex flex-col gap-4">
      {complete && (
        <GoalCompletionNotice
          goals={[goal]}
          rememberDismissal={false}
          onView={() => setView("history")}
        />
      )}
      <div data-tour-target={finished ? "goal-finish" : "goal-progress"}>
        <GoalSection
          hasGoals
          action={
            <AppLink href={href("goals")} className={buttonVariants()}>
              Set goal
            </AppLink>
          }
          navigation={
            <SectionNavigation
              label="Example goal views"
              appearance="pills"
              tabs={[
                {
                  id: "active",
                  label: `Active (${complete ? 0 : 1}/5)`,
                  current: view === "active",
                  onSelect: () => setView("active"),
                },
                {
                  id: "history",
                  label: `History (${complete ? 1 : 0})`,
                  current: view === "history",
                  onSelect: () => setView("history"),
                },
              ]}
            />
          }
        >
          {showGoal ? (
            <ListRow
              wrapTitle
              fullWidthTags
              className={GOAL_ROW_CLASS}
              title={
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>{goalTitle(goal)}</span>
                  <GoalDate completed={complete}>{complete ? "Mar 14" : "By Mar 31"}</GoalDate>
                </span>
              }
              tags={
                complete ? (
                  !archived && (
                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" onPress={() => setArchived(true)}>
                        Archive goal
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="w-24">
                      <ProgressBar
                        label={goalTitle(goal)}
                        value={goal.progress}
                        max={goal.target}
                      />
                    </div>
                    <span className="text-xs tabular-nums">
                      {goal.progress}/{goal.target}
                    </span>
                  </div>
                )
              }
            />
          ) : (
            <p className="py-3 text-xs text-muted">
              {view === "active" ? "No active goals." : "No goal history yet."}
            </p>
          )}
        </GoalSection>
      </div>
      {!finished && (
        <section aria-label="Practice logging" className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              isDisabled={complete}
              onPress={() =>
                setEntries((current) => [
                  ...current,
                  { id: current.length + 1, tags: ["strength"] },
                ])
              }
            >
              Log strength only
            </Button>
            <Button
              isDisabled={complete}
              onPress={() =>
                setEntries((current) => [
                  ...current,
                  { id: current.length + 1, tags: ["hangboard", "strength"] },
                ])
              }
            >
              Log both tags
            </Button>
            <Button
              variant="ghost"
              onPress={() => {
                setEntries([]);
                setArchived(false);
                setView("active");
              }}
            >
              Reset example
            </Button>
          </div>
          <ul
            aria-label="Example training entries"
            className="flex flex-col gap-2 text-sm text-muted"
          >
            {entries.map((entry) => (
              <li key={entry.id}>Training · {entry.tags.map((tag) => `#${tag}`).join(" ")}</li>
            ))}
          </ul>
          <p role="status" className="text-xs text-muted">
            {goal.progress} of {entries.length} sample entries match both tags.
          </p>
        </section>
      )}
      {complete && (
        <section aria-label="Example friend's feed" className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">A friend’s feed</h3>
          <FeedActivityCard
            entries={[{ day: TOUR_DEMO_GOAL_FEED, activity: TOUR_DEMO_GOAL_FEED.activities[0] }]}
            view="all"
            links={false}
          />
          <AppLink href={href("account", "full")} className="text-sm">
            Review Journal and goals sharing
          </AppLink>
        </section>
      )}
    </div>
  );
}

/** Real goal controls and display primitives with fictional data and local callbacks only. */
export function DemoGoals({
  stepId,
  href,
}: {
  stepId: string;
  href: ProductTourPageProps["href"];
}) {
  return stepId === "goals" || stepId === "goal-tags" ? (
    <DemoGoalEditor key={stepId} withTags={stepId === "goal-tags"} />
  ) : (
    <DemoGoalLifecycle key={stepId} finished={stepId === "goal-achievements"} href={href} />
  );
}
