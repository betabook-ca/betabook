import { CurrentPageAuthCallout } from "@/components/auth/current-page-auth-callout";
import { ImportWizard } from "@/components/import";

export default function ImportRoute({ viewerId }: { viewerId: string | null }) {
  return viewerId ? (
    <ImportWizard viewerId={viewerId} profileHref={`/users/${viewerId}`} />
  ) : (
    <CurrentPageAuthCallout />
  );
}
