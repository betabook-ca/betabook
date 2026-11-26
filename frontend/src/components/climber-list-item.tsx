import { FriendshipButton } from "@/components/friendship-button";
import { AppLink } from "@/components/ui/app-link";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { FriendshipStatus } from "@/lib/friendships";

/** Shared by the friend lists and suggestions so both rows stay identical. */
export function ClimberListItem({
  climber,
  detail,
  compact = false,
}: {
  climber: {
    id: string;
    name: string;
    image: string | null;
    isPrivate?: boolean;
    friendshipStatus: FriendshipStatus;
  };
  detail?: string;
  compact?: boolean;
}) {
  return (
    <article
      className={`flex min-w-0 items-center justify-between gap-3 border-b border-separator ${compact ? "min-h-15 py-1.5" : "flex-wrap py-4"}`}
    >
      <div className="flex min-w-0 flex-auto items-center gap-3">
        <UserAvatar name={climber.name} image={climber.image} size="sm" />
        <div className="min-w-0">
          <h3
            className={compact ? "truncate text-sm font-semibold" : "font-semibold wrap-anywhere"}
          >
            {climber.isPrivate ? (
              climber.name
            ) : (
              <AppLink
                href={`/users/${climber.id}`}
                className="text-foreground"
                title={compact ? climber.name : undefined}
              >
                {climber.name}
              </AppLink>
            )}
          </h3>
          {detail && (
            <p className={compact ? "truncate text-xs text-muted" : "text-sm text-muted"}>
              {detail}
            </p>
          )}
        </div>
      </div>
      <div className="ml-auto max-w-full shrink-0">
        <FriendshipButton
          appearance={compact && climber.friendshipStatus === "friends" ? "menu" : "row"}
          compact={compact}
          userId={climber.id}
          name={climber.name}
          initialStatus={climber.friendshipStatus}
        />
      </div>
    </article>
  );
}
