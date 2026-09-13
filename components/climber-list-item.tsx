import { FriendshipButton } from "@/components/friendship-button";
import { AppLink } from "@/components/ui/app-link";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { FriendshipStatus } from "@/lib/friendships";

/** Shared by the friend lists and suggestions so both rows stay identical. */
export function ClimberListItem({
  climber,
  detail,
}: {
  climber: {
    id: string;
    name: string;
    image: string | null;
    isPrivate?: boolean;
    friendshipStatus: FriendshipStatus;
  };
  detail?: string;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3 border-b border-separator py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar name={climber.name} image={climber.image} size="sm" />
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            {climber.isPrivate ? (
              climber.name
            ) : (
              <AppLink href={`/users/${climber.id}`}>{climber.name}</AppLink>
            )}
          </h3>
          {detail && <p className="text-sm text-muted">{detail}</p>}
        </div>
      </div>
      <FriendshipButton
        userId={climber.id}
        name={climber.name}
        initialStatus={climber.friendshipStatus}
      />
    </article>
  );
}
