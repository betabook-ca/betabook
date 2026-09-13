"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { recordTermsAcceptance } from "@/db/queries/terms";
import {
  ActionError,
  NotSignedInError,
  toActionResult,
  type ActionResult,
} from "@/lib/action-result";
import { getSession } from "@/lib/session";
import { hasAcceptedCurrentTerms, TERMS_VERSION } from "@/lib/terms";

export async function acceptTerms(version: unknown, agreed: unknown): Promise<ActionResult> {
  return toActionResult(async () => {
    // Agreement is the intentional exception to requireSession's terms gate.
    const session = await getSession();
    if (!session) throw new NotSignedInError();
    if (agreed !== true) throw new ActionError("Select the agreement checkbox to continue.");
    if (version !== TERMS_VERSION)
      throw new ActionError(
        "The terms have changed. Reload this page to review the current version.",
      );
    const acceptance = await recordTermsAcceptance(await getDb(), session.user.id);
    if (!hasAcceptedCurrentTerms(acceptance)) throw new NotSignedInError();
    revalidatePath("/", "layout");
  });
}
