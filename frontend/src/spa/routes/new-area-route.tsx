import { AddKindNav } from "@/components/app-shell/add-kind-nav";
import { NewAreaForm } from "@/components/areas/new-area-form";
import { CurrentPageAuthCallout } from "@/components/auth/current-page-auth-callout";
import { PageTitle } from "@/components/ui/typography";

export default function NewAreaRoute({ viewerId }: { viewerId: string | null }) {
  if (!viewerId) {
    return <CurrentPageAuthCallout />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <PageTitle>Add a climb or area</PageTitle>
        <AddKindNav current="area" />
      </div>
      <NewAreaForm />
    </div>
  );
}
