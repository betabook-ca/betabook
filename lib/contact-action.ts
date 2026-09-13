"use server";

import { headers } from "next/headers";

import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import {
  CONTACT_FORM_FIELDS,
  formatContactEmail,
  looksAutomated,
  validateContactInput,
} from "@/lib/contact";
import { sendContactEmail } from "@/lib/email";
import { allowContactSubmission } from "@/lib/rate-limit";
import { pickFormFields } from "@/lib/validation";

const THROTTLED_MESSAGE = "Too many messages from this network. Try again in a minute.";

/** The one action in the app that doesn't call `requireSession()` — being
 * reachable by a signed-out visitor is the entire point of the contact form.
 * The bot checks and the rate limiter below stand in for the session check.
 *
 * Kept in lib/ rather than db/ because it touches no database, and split
 * from lib/contact.ts because a "use server" file can only export async
 * functions — the same constraint lib/sends.ts documents for
 * IMPORT_BATCH_SIZE — while the form needs the length caps as constants.
 */
export async function submitContactMessage(formData: FormData): Promise<ActionResult> {
  return toActionResult(async () => {
    const raw = pickFormFields(formData, CONTACT_FORM_FIELDS);

    // Ahead of validation and the rate limiter's round trip: this costs
    // nothing, and a caught bot must not learn which check caught it, so it
    // gets the same silent success a real send gets.
    if (looksAutomated(raw)) return;

    const input = validateContactInput(raw);

    // A server action has no `request`, so the IP comes from the header
    // Cloudflare sets on every inbound request. It's absent under `next dev`,
    // where one shared "unknown" bucket is the right way to fail — throttling
    // everyone together beats a per-request key that throttles nobody. Never
    // key on the email: the sender picks that.
    const ip = (await headers()).get("cf-connecting-ip") ?? "unknown";
    if (!(await allowContactSubmission(ip))) throw new ActionError(THROTTLED_MESSAGE);

    await sendContactEmail({ replyTo: input.email, ...formatContactEmail(input) });
  });
}
