"use client";

import { Button, Menu, Modal, useOverlayState } from "@heroui/react";
import { CirclePlus } from "lucide-react";
import { useState } from "react";

import { saveGoal, deleteGoal, acknowledgeGoalAchievements, archiveMissedGoal } from "@/actions";
import { ActionsMenu } from "@/components/ui/actions-menu";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { DisciplineChip } from "@/components/ui/discipline-chip";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ListRow } from "@/components/ui/list-row";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import { OptionSelect } from "@/components/ui/option-select";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionNavigation } from "@/components/ui/section-navigation";
import { useGoalPages } from "@/hooks/use-goal-pages";
import { useMounted } from "@/hooks/use-mounted";
import { apiFetch } from "@/lib/api-client";
import { goalDateLabel, recurringGoalResetLabel } from "@/lib/goal-date-label";
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
    grade: goal.grade === null ? "any" : String(goal.grade),
    amount: String(goal.target),
    period: goal.timeframe,
    startDate: goal.startDate,
    endDate: goal.endDate,
    repeat: goal.repeat,
  };
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
  return (
    <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-sm">
      <span className="flex min-w-0 flex-wrap items-center gap-x-1">
        <span>{goalTitle(goal)}</span>
        {goal.discipline && <DisciplineChip type={goal.discipline} />}
      </span>
      {!(view === "completed" && goal.recurring && goal.repeat !== "none") && (
        <span className="ml-auto flex shrink-0 flex-col items-end gap-1 text-right">
          <GoalDate completed={Boolean(goal.completedDate)}>
            {goalDateLabel(
              {
                ...goal,
                completedDate: view === "completed" ? goal.completedDate : null,
              },
              today,
            )}
          </GoalDate>
          {isMissed && view === "completed" && <span className="text-xs text-muted">Not met</span>}
        </span>
      )}
    </span>
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
}) {
  const mounted = useMounted();
  const [dismissedCompletions, setDismissedCompletions] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"active" | "completed">(initialView);
  const active = initialActive;
  const activeCount = active.goals.filter(
    (goal) => !(goal.missed ?? isMissedGoal(goal, today)),
  ).length;
  const needsDecision = (goal: GoalProgress) =>
    goal.needsAction ?? missedGoalNeedsAction(goal, today);
  const missed = (goal: GoalProgress) => goal.missed ?? isMissedGoal(goal, today);
  const showMissedActions = (goal: GoalProgress) => view === "active" && needsDecision(goal);

  const canEditGoal = (goal: GoalProgress) =>
    !goal.archived && (view === "active" || !missed(goal));
  const [deleteError, setDeleteError] = useState("");
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [editor, setEditor] = useState<GoalEditor>({ kind: "create" });
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
      timeframe: draft.period,
      repeat: draft.repeat,
      startDate: draft.startDate,
      endDate: draft.endDate,
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
    setArchivingId(goal.id);
    setArchiveError("");
    try {
      const result = await archiveMissedGoal(goal.id);
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
                <div className="flex w-full min-w-0 flex-col gap-2">
                  {view === "completed" && goal.repeat !== "none" && !goal.completedDate && (
                    <span className="text-xs text-muted">Not met</span>
                  )}
                  {view === "completed" ? (
                    <GoalItems ownerId={ownerId} goal={goal} loadItems={loadItems} />
                  ) : goal.kind !== "grade" || needsDecision(goal) ? (
                    <div className="flex w-full items-center gap-2">
                      {goal.kind !== "grade" && (
                        <>
                          <div className="w-24 [&>div]:h-1 dark:[&>div]:bg-white">
                            <ProgressBar
                              value={Math.min(goal.progress, goal.target)}
                              max={goal.target}
                              label={goalTitle(goal)}
                            />
                          </div>
                          <span className="text-xs tabular-nums">
                            {goal.progress}/{goal.target}
                          </span>
                        </>
                      )}
                      {missed(goal) && (
                        <span className="ml-auto text-right text-xs text-muted">Not met</span>
                      )}
                      {goal.repeat !== "none" && goal.progress >= goal.target && (
                        <span className="ml-auto shrink-0 text-right text-xs font-normal text-muted">
                          {recurringGoalResetLabel(goal, today)}
                        </span>
                      )}
                    </div>
                  ) : undefined}
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
              }
              actions={
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
              }
            />
          ))}
        </div>
        {rows.length === 0 && (
          <div className="mt-2 text-xs font-normal text-muted">
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
      <Modal.Backdrop
        isOpen={editState.isOpen}
        onOpenChange={(open) => {
          if (!pending) editState.setOpen(open);
        }}
      >
        <Modal.Container placement="center" scroll="inside">
          <Modal.Dialog className="w-full max-w-lg">
            <Modal.Header>
              <Modal.Heading className="sr-only">
                {editing ? "Edit goal" : "Set goal"}
              </Modal.Heading>
              <Modal.CloseTrigger isDisabled={pending} />
            </Modal.Header>
            <Modal.Body>
              {editState.isOpen && (
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
                  today={today}
                  nextGrades={nextGrades}
                  onSave={save}
                  onCancel={editState.close}
                  onPendingChange={setPending}
                />
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
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
