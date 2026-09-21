"use client";

import { Button, Menu, useOverlayState } from "@heroui/react";
import { CirclePlus } from "lucide-react";
import { useState } from "react";

import { saveGoal, deleteGoal, acknowledgeGoalAchievements, archiveGoal } from "@/actions";
import { ActionsMenu } from "@/components/ui/actions-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ListRow } from "@/components/ui/list-row";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { OptionSelect } from "@/components/ui/option-select";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SectionNavigation } from "@/components/ui/section-navigation";
import { useGoalPages } from "@/hooks/use-goal-pages";
import { useMounted } from "@/hooks/use-mounted";
import { apiFetch } from "@/lib/api-client";
import {
  goalDateLabel,
  recurringGoalResetLabel,
  recurringGoalEndLabel,
} from "@/lib/goal-date-label";
import {
  goalTitle,
  isMissedGoal,
  missedGoalNeedsAction,
  goalWindow,
  MAX_ACTIVE_GOALS,
  type GoalInput,
  type GoalPage,
  type GoalProgress,
  type GoalContribution,
  type GoalHistoryPage,
} from "@/lib/goals";

import {
  GoalCompletionNotice,
  goalCompletionKey,
  hasSeenGoalCompletion,
} from "./goal-completion-notice";
import { GoalDate, GOAL_ROW_CLASS } from "./goal-date";
import { GoalForm, type GoalDraft } from "./goal-form";
import { GoalItems } from "./goal-items";
import { GoalRecurringHistory } from "./goal-recurring-history";
import { GoalSection } from "./goal-section";

type GoalEditor =
  | { kind: "create" }
  | { kind: "edit"; goal: GoalProgress }
  | { kind: "retry"; goalId: number; draft: GoalDraft };

function draftFor(goal: GoalProgress): GoalDraft {
  return {
    category:
      goal.kind === "training"
        ? "training"
        : goal.kind === "days" || goal.kind === "new-areas"
          ? "explore"
          : "climbing",
    goal: goal.kind,
    discipline: goal.discipline ?? "boulder",
    gradeMatch: goal.gradeMatch ?? "exact",
    tags: goal.tags ?? [],
    grade: goal.grade === null ? "any" : String(goal.grade),
    amount: String(goal.target),
    period: goal.timeframe,
    startDate: goal.startDate,
    endDate: goal.endDate,
    repeat: goal.repeat,
    recurringEndDate: goal.recurringEndDate ?? null,
  };
}

function GoalRowDateStack({
  goal,
  view,
  today,
  isMissed,
  dateLabel,
  longRange,
  mobileLongClimb,
}: {
  goal: GoalProgress;
  view: "active" | "completed";
  today: string;
  isMissed: boolean;
  dateLabel: string;
  longRange: string[] | null;
  mobileLongClimb: boolean;
}) {
  const showPeriod = !(view === "completed" && goal.recurring && goal.repeat !== "none");
  const showReset =
    view === "active" &&
    goal.repeat !== "none" &&
    goal.progress >= goal.target &&
    goal.recurringEndDate !== goal.periodEnd;
  const showEnd = Boolean(goal.recurringEndDate || (view === "active" && goal.repeat !== "none"));
  return (
    <div
      className={`flex shrink-0 flex-col items-end gap-1 text-right ${mobileLongClimb ? "max-[480px]:col-start-2 max-[480px]:row-start-2" : ""}`}
    >
      {showPeriod && (
        <>
          <GoalDate completed={Boolean(goal.completedDate)}>
            {longRange ? (
              <span className="inline-flex flex-col items-end">
                <span className="whitespace-nowrap">{longRange[0]} –</span>
                <span className="whitespace-nowrap">{longRange[1]}</span>
              </span>
            ) : (
              dateLabel
            )}
          </GoalDate>
          {isMissed && <span className="text-xs text-muted">Not met</span>}
        </>
      )}
      {showReset && (
        <span className="text-xs font-normal text-muted">
          {recurringGoalResetLabel(goal, goal.today ?? today)}
        </span>
      )}
      {showEnd && (
        <span className="text-xs font-normal text-muted">
          {goal.recurringEndDate
            ? recurringGoalEndLabel(goal.recurringEndDate, goal.today ?? today)
            : "No end date"}
        </span>
      )}
    </div>
  );
}

function GoalRowTitle({
  goal,
  view,
  today,
  isMissed,
}: {
  goal: GoalProgress;
  view: "active" | "completed";
  today: string;
  isMissed: boolean;
}) {
  const dateLabel = goalDateLabel(
    {
      ...goal,
      completedDate: view === "completed" || goal.repeat === "none" ? goal.completedDate : null,
    },
    today,
  );
  const longRange =
    dateLabel.length > 22 && dateLabel.includes(" – ") ? dateLabel.split(" – ") : null;
  const mobileLongClimb = Boolean(goal.discipline && longRange);
  const showProgress =
    view === "active" && goal.kind !== "grade" && !(goal.repeat === "none" && goal.completedDate);
  return (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_max-content] items-baseline gap-x-2 gap-y-1 text-sm">
      <div
        className={`flex min-w-0 flex-col items-start gap-1 ${mobileLongClimb ? "max-[480px]:contents" : ""}`}
      >
        <div className={`min-w-0 ${mobileLongClimb ? "max-[480px]:col-span-2" : ""}`}>
          <span data-goal-title>{goalTitle(goal)}</span>
          {goal.discipline && (
            <span className="ml-1 inline-flex align-middle">
              <DisciplineChip type={goal.discipline} />
            </span>
          )}
        </div>
        {showProgress && (
          <div
            className={`flex items-center gap-2 font-normal ${mobileLongClimb ? "max-[480px]:col-start-1 max-[480px]:row-start-2" : ""}`}
          >
            <div className="w-20 md:w-24 [&>div]:h-1 dark:[&>div]:bg-white">
              <ProgressBar
                value={Math.min(goal.progress, goal.target)}
                max={goal.target}
                label={goalTitle(goal)}
              />
            </div>
            <span className="text-xs tabular-nums">
              {goal.progress}/{goal.target}
            </span>
          </div>
        )}
      </div>
      <GoalRowDateStack
        goal={goal}
        view={view}
        today={today}
        isMissed={isMissed}
        dateLabel={dateLabel}
        longRange={longRange}
        mobileLongClimb={mobileLongClimb}
      />
    </div>
  );
}

// oxlint-disable-next-line complexity -- goal lifecycle, history pagination and edit/delete overlays
export function GoalPanel({
  ownerId,
  initialActive,
  initialCompleted,
  timezone,
  today,
  nextGrades,
  availableTags,
  initialView = "active",
  loadPage,
  loadItems,
  loadHistory,
}: {
  ownerId: string;
  initialActive: GoalPage;
  initialCompleted: GoalPage;
  timezone: string;
  today: string;
  initialView?: "active" | "completed";
  loadPage?: (view: "active" | "completed", offset: number, year: number) => Promise<GoalPage>;
  loadItems?: (goal: GoalProgress) => Promise<GoalContribution[]>;
  loadHistory?: (goalId: number, offset: number, anchor?: string) => Promise<GoalHistoryPage>;
  nextGrades?: Partial<Record<"boulder" | "sport" | "trad", number>>;
  availableTags?: string[];
}) {
  const mounted = useMounted();
  const [dismissedCompletions, setDismissedCompletions] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"active" | "completed">(initialView);
  const active = initialActive;
  const activeCount = active.goals.filter(
    (goal) =>
      !(goal.missed ?? isMissedGoal(goal, today)) &&
      (goal.repeat !== "none" || !goal.completedDate),
  ).length;
  const needsDecision = (goal: GoalProgress) =>
    goal.needsAction ?? missedGoalNeedsAction(goal, today);
  const missed = (goal: GoalProgress) => goal.missed ?? isMissedGoal(goal, today);
  const showMissedActions = (goal: GoalProgress) => view === "active" && needsDecision(goal);

  const canEditGoal = (goal: GoalProgress) =>
    !goal.archived &&
    (!goal.recurringEndDate || goal.recurringEndDate >= (goal.today ?? today)) &&
    (view === "active" || !missed(goal));
  const [deleteError, setDeleteError] = useState("");
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [editor, setEditor] = useState<GoalEditor>({ kind: "create" });
  const [detailsStep, setDetailsStep] = useState(false);
  const editing = editor.kind === "edit" ? editor.goal : null;
  const [deleting, setDeleting] = useState<GoalProgress | null>(null);
  const [pending, setPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const editState = useOverlayState();
  const deleteState = useOverlayState();
  const {
    page: completed,
    year,
    loading,
    moreFailed,
    error,
    changeYear,
    more,
    retry,
  } = useGoalPages(initialCompleted, today, async (selectedYear, offset, signal) => {
    if (loadPage) return loadPage("completed", offset, selectedYear);
    const res = await apiFetch(
      `/api/users/${ownerId}/goals?view=completed&offset=${offset}&year=${selectedYear}`,
      { signal },
    );
    if (!res.ok) throw new Error("Could not load goals.");
    return res.json();
  });
  async function save(draft: GoalDraft) {
    const climbing = draft.goal === "volume" || draft.goal === "grade";
    const input: GoalInput = {
      kind: draft.goal,
      target: draft.goal === "grade" ? 1 : Number(draft.amount),
      discipline: climbing ? draft.discipline : null,
      grade: climbing && draft.grade !== "any" ? Number(draft.grade) : null,
      gradeMatch: draft.gradeMatch ?? "exact",
      tags: draft.tags ?? [],
      timeframe: draft.period,
      repeat: draft.repeat,
      startDate: draft.startDate,
      endDate: draft.endDate,
      recurringEndDate:
        editing && draft.recurringEndDate === (editing.recurringEndDate ?? null)
          ? undefined
          : (draft.recurringEndDate ?? null),
      timezone: editing?.timezone ?? timezone,
    };
    const result =
      editor.kind === "retry"
        ? await saveGoal(null, input, editor.goalId)
        : await saveGoal(editing?.id ?? null, input);
    if (!result.ok) throw new Error(result.error);
    editState.close();
    if (!editing) setView("active");
    setEditor({ kind: "create" });
    setDeleteError("");
  }
  function tryAgain(goal: GoalProgress) {
    const draft = draftFor(goal);
    const end = new Date(`${today}T12:00:00Z`);
    end.setUTCDate(
      end.getUTCDate() +
        Math.round((Date.parse(goal.endDate) - Date.parse(goal.startDate)) / 86400000),
    );
    const window = goalWindow(draft.period, today, end.toISOString().slice(0, 10), today);
    setEditor({ kind: "retry", goalId: goal.id, draft: { ...draft, ...window, repeat: "none" } });
    editState.open();
  }
  async function archive(goal: GoalProgress) {
    if (archivingId !== null) return;
    setArchivingId(goal.id);
    setArchiveError("");
    try {
      const result = await archiveGoal(goal.id);
      if (!result.ok) setArchiveError(result.error);
    } catch {
      setArchiveError("Could not archive the goal. Try again.");
    } finally {
      setArchivingId(null);
    }
  }
  async function remove() {
    if (!deleting) return;
    setDeletePending(true);
    setDeleteError("");
    try {
      const result = await deleteGoal(deleting.id);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      deleteState.close();
      setDeleting(null);
    } catch {
      setDeleteError("Could not delete the goal. Try again.");
    } finally {
      setDeletePending(false);
    }
  }
  function goalActions(goal: GoalProgress) {
    return (
      <ActionsMenu
        ariaLabel={`Actions for ${goalTitle(goal)}`}
        onAction={(key) => {
          if (key === "edit") {
            const selected = active.goals.find((item) => item.id === goal.id) ?? goal;
            setEditor({ kind: "edit", goal: selected });
            editState.open();
          } else {
            setDeleting(goal);
            deleteState.open();
            setDeleteError("");
          }
        }}
      >
        {canEditGoal(goal) && <Menu.Item id="edit">Edit</Menu.Item>}
        <Menu.Item id="delete">Delete</Menu.Item>
      </ActionsMenu>
    );
  }
  const anyGoals =
    active.goals.length > 0 ||
    initialCompleted.goals.length > 0 ||
    completed.goals.length > 0 ||
    (completed.years?.length ?? 0) > 1;
  const rows = view === "active" ? active.goals : completed.goals;
  const historyYears = [...new Set([...(completed.years ?? []), year])].sort((a, b) => b - a);
  const newlyCompleted = mounted
    ? [
        ...new Map(
          (initialCompleted.celebrations ?? []).map((goal) => [goalCompletionKey(goal), goal]),
        ).values(),
      ].filter(
        (goal) =>
          Boolean(goal.completedDate) &&
          !dismissedCompletions.has(goalCompletionKey(goal)) &&
          !hasSeenGoalCompletion(goal),
      )
    : [];
  return (
    <>
      {newlyCompleted.length > 0 && (
        <GoalCompletionNotice
          key={newlyCompleted.map(goalCompletionKey).join("|")}
          goals={newlyCompleted}
          onDismiss={async () => {
            for (let offset = 0; offset < newlyCompleted.length; offset += 200) {
              const result = await acknowledgeGoalAchievements(
                newlyCompleted
                  .slice(offset, offset + 200)
                  .map(({ id, periodStart, repeat }) => ({ id, periodStart, repeat })),
              );
              if (!result.ok) throw new Error(result.error);
            }
            setDismissedCompletions(
              (current) => new Set([...current, ...newlyCompleted.map(goalCompletionKey)]),
            );
          }}
          onView={() => {
            setView("completed");
            const achievementYear = Math.max(
              ...newlyCompleted.map((goal) =>
                Number(
                  (goal.repeat === "none" ? (goal.completedDate ?? today) : goal.periodStart).slice(
                    0,
                    4,
                  ),
                ),
              ),
            );
            if (year !== achievementYear) void changeYear(String(achievementYear));
          }}
        />
      )}
      <GoalSection
        hasGoals={anyGoals}
        action={
          <Button
            className="min-h-11 gap-2"
            isDisabled={activeCount >= MAX_ACTIVE_GOALS}
            onPress={() => {
              setEditor({ kind: "create" });
              setDetailsStep(false);
              editState.open();
            }}
          >
            <CirclePlus aria-hidden="true" className="size-5" />
            Set goal
          </Button>
        }
        navigation={
          <SectionNavigation
            label="Goal views"
            appearance="pills"
            tabs={[
              {
                id: "active",
                label: `Active (${activeCount}/${MAX_ACTIVE_GOALS})`,
                current: view === "active",
                onSelect: () => setView("active"),
              },
              {
                id: "history",
                label: `History (${completed.total ?? completed.goals.length})`,
                current: view === "completed",
                onSelect: () => setView("completed"),
              },
            ]}
          />
        }
      >
        {view === "completed" && historyYears.length > 1 && (
          <div className="flex justify-end py-3">
            <OptionSelect
              ariaLabel="History year"
              value={String(year)}
              onChange={(value) => {
                void changeYear(value);
              }}
              className={FIELD_WIDTH_CLASS.short}
              options={historyYears.map((value) => ({
                value: String(value),
                label: String(value),
              }))}
            />
          </div>
        )}
        <div className="divide-y divide-foreground/20">
          {rows.map((goal) => (
            <ListRow
              key={`${goal.id}-${goal.periodStart}`}
              wrapTitle
              fullWidthTags
              className={GOAL_ROW_CLASS}
              title={<GoalRowTitle goal={goal} view={view} today={today} isMissed={missed(goal)} />}
              tags={
                view === "completed" || showMissedActions(goal) ? (
                  <div className="flex w-full min-w-0 flex-col gap-2">
                    {view === "completed" && goal.repeat !== "none" && !goal.completedDate && (
                      <span className="text-xs text-muted">Not met</span>
                    )}
                    {view === "completed" && (
                      <GoalItems ownerId={ownerId} goal={goal} loadItems={loadItems} />
                    )}
                    {showMissedActions(goal) && (
                      <span className="ml-auto flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          className="bg-navigation-active! text-xs! text-link! hover:bg-navigation-active!"
                          variant="outline"
                          isDisabled={archivingId === goal.id || activeCount >= MAX_ACTIVE_GOALS}
                          onPress={() => tryAgain(goal)}
                        >
                          Try again
                        </Button>
                        <Button
                          size="sm"
                          className="-mr-3 text-xs!"
                          variant="ghost"
                          isDisabled={archivingId !== null}
                          onPress={() => {
                            void archive(goal);
                          }}
                        >
                          {archivingId === goal.id ? "Archiving…" : "Archive goal"}
                        </Button>
                      </span>
                    )}
                    {view === "completed" && goal.recurring && (
                      <GoalRecurringHistory
                        key={`${goal.id}-${year}-${JSON.stringify(goal.recurring)}`}
                        ownerId={ownerId}
                        goal={goal}
                        today={today}
                        currentPeriod={active.goals.find(
                          (item) => item.id === goal.id && item.repeat !== "none",
                        )}
                        loadHistory={
                          loadHistory
                            ? (offset, anchor) => loadHistory(goal.id, offset, anchor)
                            : undefined
                        }
                      />
                    )}
                  </div>
                ) : undefined
              }
              actions={goalActions(goal)}
            />
          ))}
        </div>
        {rows.length === 0 && (
          <div className="py-2.5 text-xs font-normal text-muted">
            {view === "completed" ? "No goal history yet." : "No active goals."}
          </div>
        )}
        {view === "completed" && (completed.total ?? 0) > 5 && (
          <p className="pt-2 text-xs text-muted" aria-live="polite">
            Showing {completed.goals.length} of {completed.total}
          </p>
        )}
        {view === "completed" && completed.hasMore && (
          <LoadMoreButton onPress={more} loading={loading} failed={moreFailed} />
        )}
      </GoalSection>
      {archiveError && <InlineAlert>{archiveError}</InlineAlert>}
      {error && (
        <div>
          <InlineAlert>{error}</InlineAlert>
          <Button
            variant="ghost"
            onPress={() => {
              void retry();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      <ResponsiveDialog
        state={editState}
        title={editing ? "Edit goal" : "Set goal"}
        hideTitle
        presentation={editor.kind !== "create" || detailsStep ? "fullscreen" : "sheet"}
        isPending={pending}
        onClose={() => setDetailsStep(false)}
      >
        <GoalForm
          embedded
          initialDraft={
            editing
              ? {
                  ...draftFor(editing),
                  ...(editing.repeat === "none" && editing.periodEnd < today
                    ? { period: "custom" as const }
                    : {}),
                }
              : undefined
          }
          initialValues={editor.kind === "retry" ? editor.draft : undefined}
          today={editing?.today ?? today}
          nextGrades={nextGrades}
          availableTags={availableTags}
          onSave={save}
          onCancel={editState.close}
          onPendingChange={setPending}
          onStepChange={(step) => setDetailsStep(step === "details")}
        />
      </ResponsiveDialog>
      <ConfirmDeleteDialog
        state={deleteState}
        noun="goal"
        description="Your journal entries will be kept."
        onConfirm={remove}
        isPending={deletePending}
        error={deleteError}
      />
    </>
  );
}
