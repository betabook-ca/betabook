import type { Metadata } from "next";

import { AddKindNav } from "@/components/add-kind-nav";
import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { NewAreaForm } from "@/components/new-area-form";
import { PageTitle } from "@/components/ui/typography";
import { getMemberSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Add area",
  robots: { index: false },
};

export default async function NewAreaPage() {
  const session = await getMemberSession();
  if (!session) return <CurrentPageAuthCallout />;

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
