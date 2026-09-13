import { TERMS_ACCESS_MESSAGE } from "@/lib/terms";

/** Return intentional action failures as data because Next.js redacts uncaught server errors. */
export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

/** An error message safe to show to the user. Unexpected errors remain generic. */
export class ActionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

export class TermsAcceptanceRequiredError extends ActionError {
  public constructor() {
    super(TERMS_ACCESS_MESSAGE);
    this.name = "TermsAcceptanceRequiredError";
  }
}

export const SESSION_EXPIRED_MESSAGE = "Your session has expired — sign in again to continue.";

export const NOT_ADMIN_MESSAGE = "Admins only.";

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Keep session error types here so result handling does not import the auth stack. */
export class NotSignedInError extends Error {
  public constructor() {
    super("Not signed in");
    this.name = "NotSignedInError";
  }
}

export class NotAdminError extends Error {
  public constructor() {
    super("Not an admin");
    this.name = "NotAdminError";
  }
}

/** Do not wrap redirect/notFound here: their control-flow exceptions would be
 * converted to generic failures. Navigation follows the action result. */
export async function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof NotSignedInError) {
      return { ok: false, error: SESSION_EXPIRED_MESSAGE };
    }
    if (err instanceof NotAdminError) {
      return { ok: false, error: NOT_ADMIN_MESSAGE };
    }
    if (err instanceof ActionError) {
      return { ok: false, error: err.message };
    }
    console.error(err);
    return { ok: false, error: GENERIC_ERROR_MESSAGE };
  }
}
