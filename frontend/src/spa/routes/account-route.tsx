import { Button } from "@heroui/react";

import AccountLoading from "@/components/account/account-loading";
import { AccountSettings } from "@/components/account/account-settings";
import { CurrentPageAuthCallout } from "@/components/auth/current-page-auth-callout";
import { InlineAlert } from "@/components/ui/inline-alert";
import { fetchApi } from "@/spa/lib/api";
import { useRouter } from "@/spa/lib/navigation";
import { useRetainedPage } from "@/spa/lib/use-retained-page";

export default function AccountRoute({ viewerId }: { viewerId: string | null }) {
  const router = useRouter();
  const { data, error } = useRetainedPage({
    resource: "account:AccountRoute",
    cache: false,
    scope: viewerId,
    query: "",
    load: (signal) => fetchApi("/api/pages/account", { signal, sessionEvents: true }),
  });
  if (!viewerId) return <CurrentPageAuthCallout />;
  return (
    <>
      {Boolean(error) && (
        <InlineAlert
          action={
            <Button size="sm" onPress={router.refresh}>
              Retry
            </Button>
          }
        >
          Couldn’t load account settings.
        </InlineAlert>
      )}
      {data ? <AccountSettings key={viewerId} {...data} /> : !error ? <AccountLoading /> : null}
    </>
  );
}
