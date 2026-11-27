import { ActionError } from "@/lib/action-result";
import { requireTrimmed, trimOrNull } from "@/lib/validation";

export const MAX_NAME_LENGTH = 100;
export const MAX_EMAIL_LENGTH = 254; // RFC 5321's reverse-path limit.
export const MAX_MESSAGE_LENGTH = 5000;

/** Milliseconds a real visitor needs between the form mounting and pressing
 * Send. Measured from mount rather than first keystroke, which is what lets
 * the floor sit this low without ever catching a human: nobody loads
 * /contact and submits a written message inside two seconds. */
export const MIN_FILL_MS = 2000;

/** The decoy input's name. Plausible enough that a form-filler reaches for
 * it, and not a field this form would ever really want. Shared so the
 * component and the validator can't drift apart. */
export const HONEYPOT_FIELD = "website";

export const CONTACT_FORM_FIELDS = ["name", "email", "message", HONEYPOT_FIELD, "elapsed"] as const;

export type RawContactInput = Record<
  (typeof CONTACT_FORM_FIELDS)[number],
  FormDataEntryValue | null
>;

export type ContactInput = {
  name: string | null;
  email: string;
  message: string;
};

// Deliberately loose. The only authoritative test of an address is whether a
// reply lands, so this rejects obvious nonsense plus the characters that
// could smuggle a display name or a second address into the Reply-To, and
// lets everything else through rather than bouncing a real address that a
// stricter pattern got wrong.
const EMAIL_PATTERN = /^[^\s@<>,]+@[^\s@<>,.]+\.[^\s@<>,]+$/;

/** True when the submission looks automated.
 *
 * Both signals are client-side, so anything that reverse-engineers the
 * server action's ID can forge them. They aren't the security control — the
 * rate limiter is. What they catch is the realistic bot population for a
 * JS-only form: headless browsers that fill every input on the page and
 * submit immediately.
 *
 * Callers must treat a `true` here as success, not as an error. Telling a
 * bot which check caught it only helps it tune, and with the floor measured
 * from mount a false positive is not a case worth designing a message for.
 */
export function looksAutomated(raw: RawContactInput): boolean {
  if (trimOrNull(raw[HONEYPOT_FIELD])) return true;

  const elapsed = Number(raw.elapsed);
  return !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS;
}

export function validateContactInput(raw: RawContactInput): ContactInput {
  const name = trimOrNull(raw.name);
  if (name && name.length > MAX_NAME_LENGTH) {
    throw new ActionError(`Name must be ${MAX_NAME_LENGTH} characters or fewer`);
  }

  const email = requireTrimmed(raw.email, "Email");
  if (email.length > MAX_EMAIL_LENGTH) {
    throw new ActionError(`Email must be ${MAX_EMAIL_LENGTH} characters or fewer`);
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new ActionError("Enter a valid email address");
  }

  const message = requireTrimmed(raw.message, "Message");
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ActionError(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
  }

  return { name, email, message };
}

/** The subject line and plain-text body of the notification.
 *
 * Plain text, never HTML: every one of these three strings comes from a
 * stranger, and `text:` has nothing to escape. The subject is the only one
 * that leaves the body, so it's the one that gets its newlines flattened —
 * a bare line break in a header is the shape header injection takes, and
 * this costs nothing to rule out even though Resend's JSON API isn't
 * susceptible to it.
 */
export function formatContactEmail(input: ContactInput): { subject: string; text: string } {
  const from = (input.name ?? input.email).replace(/\s+/g, " ").trim().slice(0, 60);

  return {
    subject: `Betabook contact: ${from}`,
    text: [
      `From: ${input.name ?? "(no name given)"}`,
      `Email: ${input.email}`,
      "",
      input.message,
    ].join("\n"),
  };
}
