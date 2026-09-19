import { clsx } from "clsx";
import { CircleCheckBig, CircleDashed, Dumbbell, Repeat2 } from "lucide-react";

export type ActivityKind = "send" | "repeat" | "session" | "training";

const ICONS = {
  send: CircleCheckBig,
  repeat: Repeat2,
  session: CircleDashed,
  training: Dumbbell,
} as const;

/** One opaque mark across Feed cards and journal rows, independent of their surfaces. */
export function ActivityIcon({ kind, className }: { kind: ActivityKind; className?: string }) {
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
