import { CircleCheckBig } from "lucide-react";
import type { ReactNode } from "react";

export const GOAL_ROW_CLASS = "items-start gap-2! px-0! py-2.5!";

/** Absolute icon placement preserves the date baseline and reserves the same space in every state. */
export function GoalDate({
  completed = false,
  children,
}: {
  completed?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      data-goal-date
      className="relative inline-block shrink-0 pl-6 text-xs font-normal text-muted"
    >
      <span
        aria-hidden
        className="absolute top-1/2 left-0 flex size-4 -translate-y-1/2 items-center justify-center"
      >
        {completed && <CircleCheckBig className="size-4 text-success-soft-foreground" />}
      </span>
      {completed && <span className="sr-only">Completed </span>}
      {children}
    </span>
  );
}
