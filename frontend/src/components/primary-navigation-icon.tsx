import { BookOpen, TrendingUp, Users } from "lucide-react";

import { UserAvatar } from "@/components/ui/user-avatar";
import type { PrimaryArea } from "@/lib/app-navigation";

export function PrimaryNavigationIcon({
  area,
  account,
}: {
  area: PrimaryArea;
  account: { name: string; image?: string | null };
}) {
  if (area === "account") return <UserAvatar name={account.name} image={account.image} size="xs" />;
  const Icon = area === "logbook" ? BookOpen : area === "progress" ? TrendingUp : Users;
  return (
    <span className="flex size-6 shrink-0 items-center justify-center">
      <Icon aria-hidden className="size-5" />
    </span>
  );
}
