import { formatCount } from "@/lib/format";

export function withRequestCount(label: string, count: number) {
  return count > 0 ? `${label}, ${formatCount(count, "pending friend request")}` : label;
}

export function FriendRequestDot({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`size-2.5 shrink-0 rounded-full border-2 border-background bg-danger ${className}`}
    />
  );
}

/** `decorative` for a control whose own label already names the count (see withRequestCount). */
export function FriendRequestBadge({
  count,
  decorative = false,
  className = "",
}: {
  count: number | null;
  decorative?: boolean;
  className?: string;
}) {
  if (!count || count < 1) return null;
  return (
    <span
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : formatCount(count, "pending friend request")}
      aria-hidden={decorative || undefined}
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
