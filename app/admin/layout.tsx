import type { Metadata } from "next";

import { CurrentPageAuthCallout } from "@/components/current-page-auth-callout";
import { getMemberSession as getSession } from "@/lib/session";

import { requireAdminOrRedirect } from "./require-admin";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await getSession())) return <CurrentPageAuthCallout />;
  await requireAdminOrRedirect();
  return children;
}
