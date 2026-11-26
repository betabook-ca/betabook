import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { ImportWizard } from "@/components/import";

export default function ImportRoute({ viewerId }: { viewerId: string | null }) {
  return viewerId ? (
    <ImportWizard profileHref={`/users/${viewerId}`} />
  ) : (
    <CurrentPageAuthCallout />
  );
}
