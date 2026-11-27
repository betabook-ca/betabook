import { TERMS_ACCESS_MESSAGE } from "./terms.ts";

/** The API returns expected validation failures as data. */
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

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
