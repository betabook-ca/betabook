import { AddKindNav } from "@/components/add-kind-nav";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { NewAreaForm } from "@/components/new-area-form";
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
