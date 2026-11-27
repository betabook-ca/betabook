import { Button } from "@heroui/react";

import { AccountSettings } from "@/components/account-settings";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { Skeleton, SkeletonListRows } from "@/components/ui/skeleton";
import { fetchApi } from "@/spa/lib/api";
import { useRouter } from "@/spa/lib/navigation";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

export default function AccountRoute({ viewerId }: { viewerId: string | null }) {
  const router = useRouter();
  const { data, error } = useRetainedPage({
    scope: viewerId,
    query: "",
    load: (signal) => fetchApi("/api/pages/account", { signal, sessionEvents: true }),
  });
  if (!viewerId) return <CurrentPageAuthCallout />;
  return (
    <>
      {Boolean(error) && (
        <div role="alert">
          Couldn’t load account settings.{" "}
          <Button size="sm" onPress={router.refresh}>
            Retry
          </Button>
        </div>
      )}
      {data ? (
        <AccountSettings key={viewerId} {...data} />
      ) : !error ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-12 w-56" />
          <SkeletonListRows rows={8} />
        </div>
      ) : null}
    </>
  );
}
