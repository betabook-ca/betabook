import { getDb } from "@/db/client";
import { getTermsAcceptance } from "@/db/queries/terms";
import { getSession } from "@/lib/session";
import { hasAcceptedCurrentTerms, TERMS_UPDATED_LABEL, TERMS_VERSION } from "@/lib/terms";

export async function GET() {
  const session = await getSession();
  const acceptance = session ? await getTermsAcceptance(await getDb(), session.user.id) : undefined;
  return Response.json(
    {
      userId: session?.user.id ?? null,
      required: Boolean(session && !hasAcceptedCurrentTerms(acceptance)),
      version: TERMS_VERSION,
      versionLabel: TERMS_UPDATED_LABEL,
      previousVersion: acceptance?.termsVersion ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
