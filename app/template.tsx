import type { ReactNode } from "react";

import { TermsGate } from "@/components/terms-gate";
import { ViewerBoundary } from "@/components/viewer-boundary";
import { getDb } from "@/db/client";
import { getTermsAcceptance } from "@/db/queries/terms";
import { getSession } from "@/lib/session";
import { hasAcceptedCurrentTerms, TERMS_UPDATED_LABEL, TERMS_VERSION } from "@/lib/terms";

export default async function Template({ children }: { children: ReactNode }) {
  const session = await getSession();
  const acceptance = session ? await getTermsAcceptance(await getDb(), session.user.id) : undefined;
  return (
    <ViewerBoundary key={session?.user.id ?? "anonymous"} viewerId={session?.user.id ?? null}>
      <TermsGate
        viewerId={session?.user.id ?? null}
        initiallyRequired={Boolean(session && !hasAcceptedCurrentTerms(acceptance))}
        version={TERMS_VERSION}
        versionLabel={TERMS_UPDATED_LABEL}
        previousVersion={acceptance?.termsVersion ?? null}
      >
        {children}
      </TermsGate>
    </ViewerBoundary>
  );
}
