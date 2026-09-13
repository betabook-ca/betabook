import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { TermsAcceptanceForm } from "@/components/terms-acceptance-form";
import { getDb } from "@/db/client";
import { getTermsAcceptance } from "@/db/queries/terms";
import { getSession } from "@/lib/session";
import { signInUrl } from "@/lib/sign-in-redirect";
import { hasAcceptedCurrentTerms, TERMS_UPDATED_LABEL, TERMS_VERSION } from "@/lib/terms";
import { acceptTermsUrl, termsNextPath } from "@/lib/terms-navigation";

export const metadata: Metadata = {
  title: "Review the Terms of Service",
  robots: { index: false },
};

export default async function AcceptTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = termsNextPath((await searchParams).next);
  const session = await getSession();
  if (!session) redirect(signInUrl(acceptTermsUrl(next)));
  const acceptance = await getTermsAcceptance(await getDb(), session.user.id);
  if (hasAcceptedCurrentTerms(acceptance)) redirect(next);
  return (
    <TermsAcceptanceForm
      version={TERMS_VERSION}
      versionLabel={TERMS_UPDATED_LABEL}
      previousVersion={acceptance?.termsVersion ?? null}
      next={next}
    />
  );
}
