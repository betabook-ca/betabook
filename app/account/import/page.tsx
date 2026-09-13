import type { Metadata } from "next";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { ImportWizard } from "@/components/import";
import { getMemberSession as getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Import sends",
  robots: { index: false },
};

export default async function ImportPage() {
  const session = await getSession();

  if (!session) {
    return <CurrentPageAuthCallout />;
  }

  return <ImportWizard profileHref={`/users/${session.user.id}`} />;
}
