import { formatCount } from "@/lib/format";

const COUNT_CLASS =
  "inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground";

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

export function FriendRequestBadge({ count }: { count: number | null }) {
  if (!count || count < 1) return null;
  return (
    <span
      role="status"
      aria-label={formatCount(count, "pending friend request")}
      className={COUNT_CLASS}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** For a control whose own label already names the count (see withRequestCount). */
export function FriendRequestCount({
  count,
  className = "",
}: {
  count: number;
  className?: string;
}) {
  if (count < 1) return null;
  return (
    <span aria-hidden className={`${COUNT_CLASS} ${className}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
