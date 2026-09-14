"use client";

import { Button } from "@heroui/react";
import { CircleCheckBig, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { cardClass } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useMounted } from "@/hooks/use-mounted";
import { goalTitle, type GoalProgress } from "@/lib/goals";

export function goalCompletionKey(goal: GoalProgress) {
  return `betabook:goal-completed:${goal.userId}:${goal.id}:${goal.periodStart}:${goal.repeat}`;
}
export function hasSeenGoalCompletion(goal: GoalProgress) {
  try {
    return (
      localStorage.getItem(goalCompletionKey(goal)) === "true" ||
      localStorage.getItem(
        `betabook:goal-completed:${goal.userId}:${goal.id}:${goal.periodStart}`,
      ) === "true"
    );
  } catch {
    return false;
  }
}

export function GoalCompletionNotice({
  goals,
  onView,
  onDismiss,
  rememberDismissal = true,
}: {
  goals: GoalProgress[];
  onView: () => void;
  onDismiss?: () => void | Promise<void>;
  rememberDismissal?: boolean;
}) {
  const mounted = useMounted();
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const visibleGoals = goals.filter(
    (goal) => !rememberDismissal || (mounted && !hasSeenGoalCompletion(goal)),
  );
  if (!mounted || dismissed || visibleGoals.length === 0) return null;
  const goal = visibleGoals[0];
  const goalCount = new Set(visibleGoals.map((goal) => goal.id)).size;
  async function dismiss(view = false) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await onDismiss?.();
      try {
        if (rememberDismissal)
          for (const completed of visibleGoals)
            localStorage.setItem(goalCompletionKey(completed), "true");
      } catch {
        /* Optional preference. */
      }
      setDismissed(true);
      if (view) onView();
    } catch {
      setError("Could not dismiss achievements. Try again.");
    } finally {
      setPending(false);
    }
  }
  const headline =
    goalCount > 1 || goal.repeat === "none"
      ? "You did it!"
      : goal.repeat === "week"
        ? "Weekly target met!"
        : goal.repeat === "month"
          ? "Monthly target met!"
          : "Yearly target met!";
  return (
    <div
      className={`relative flex items-center gap-3 overflow-hidden p-3! ${cardClass("sm")} bg-accent! text-accent-foreground`}
      role="status"
    >
      <Button
        isIconOnly
        size="sm"
        variant="ghost"
        className="absolute top-1/2 right-2 -translate-y-1/2 text-accent-foreground"
        aria-label="Dismiss achievement"
        isDisabled={pending}
        onPress={() => {
          void dismiss();
        }}
      >
        <X aria-hidden className="size-4" />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-black/10">
          <CircleCheckBig aria-hidden className="size-5" />
          <Sparkles aria-hidden className="absolute -top-1 -right-2 size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold">{headline}</h2>
          <p className="mt-1 text-sm font-medium">
            {goalCount > 1 ? `${goalCount} goals achieved` : goalTitle(goal)}
          </p>
          {error && <InlineAlert>{error}</InlineAlert>}
        </div>
      </div>
      <div className="mr-8 flex shrink-0 justify-end">
        <Button
          size="sm"
          variant="outline"
          className="border-accent-foreground/40 bg-transparent text-accent-foreground"
          isDisabled={pending}
          onPress={() => {
            void dismiss(true);
          }}
        >
          View
        </Button>
      </div>
    </div>
  );
}
