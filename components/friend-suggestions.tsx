import { ClimberListItem } from "@/components/climber-list-item";
import { SectionHeading } from "@/components/ui/typography";
import type { SuggestedClimberRow } from "@/db/queries";
import { formatCount } from "@/lib/format";

export function FriendSuggestions({ climbers }: { climbers: SuggestedClimberRow[] }) {
  if (!climbers.length) return null;
  return (
    <section aria-label="You may know" className="flex w-full min-w-0 flex-col gap-2">
      <SectionHeading>You may know</SectionHeading>
      <div className="grid gap-x-8 lg:grid-cols-2">
        {climbers.map((climber) => (
          <ClimberListItem
            key={climber.id}
            climber={climber}
            heading="h3"
            detail={formatCount(climber.mutualFriendCount, "mutual friend")}
          />
        ))}
      </div>
    </section>
  );
}
