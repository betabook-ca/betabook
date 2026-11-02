import { clsx } from "clsx";
import { CalendarDays, CircleCheckBig, CircleDashed, Dumbbell, Repeat2 } from "lucide-react";

export type ActivityKind = "send" | "repeat" | "session" | "training";

/** A day out is no entry's status, but the Log chooser marks it like one. */
type ActivityIconKind = ActivityKind | "day";

const ICONS = {
  send: CircleCheckBig,
  repeat: Repeat2,
  session: CircleDashed,
  training: Dumbbell,
  day: CalendarDays,
} as const;

/** One opaque mark across Feed cards and journal rows, independent of their surfaces. */
export function ActivityIcon({ kind, className }: { kind: ActivityIconKind; className?: string }) {
  const Icon = ICONS[kind];
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full",
        kind === "send"
          ? "bg-(--activity-send-bg) text-accent-soft-foreground"
          : "bg-(--activity-neutral-bg) text-muted dark:text-foreground",
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
