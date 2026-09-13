import { UserAvatar } from "./user-avatar";

/** Decorative author summary. Callers provide visible names beside the stack. */
export function UserAvatarStack({
  users,
}: {
  users: ReadonlyArray<{ id: string; name: string; image?: string | null }>;
}) {
  return (
    <div aria-hidden="true" className="flex shrink-0 -space-x-2">
      {users.slice(0, 3).map((user) => (
        <UserAvatar
          key={user.id}
          name={user.name}
          image={user.image}
          size="sm"
          className="ring-2 ring-surface"
        />
      ))}
      {users.length > 3 && (
        <span className="relative flex size-8 items-center justify-center rounded-full bg-surface-secondary text-xs font-medium text-muted ring-2 ring-surface">
          +{users.length - 3}
        </span>
      )}
    </div>
  );
}
