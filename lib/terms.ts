/** Newest first. Add a new document; never edit a published version in place. */
export const TERMS_VERSIONS = [{ version: "2026-09-09", label: "September 9, 2026" }] as const;
export type TermsVersion = (typeof TERMS_VERSIONS)[number]["version"];
export const TERMS_VERSION = TERMS_VERSIONS[0].version;
export const TERMS_UPDATED_LABEL = TERMS_VERSIONS[0].label;
export const TERMS_REQUIRED_MESSAGE =
  "Please agree to the current Terms of Service to create an account.";
export const TERMS_ACCESS_MESSAGE =
  "Please review and accept the current Terms of Service to continue.";
export const TERMS_REQUIRED_EVENT = "betabook:terms-required";

export function hasAcceptedCurrentTerms(
  acceptance: { termsVersion?: string | null; termsAcceptedAt?: Date | null } | null | undefined,
) {
  return acceptance?.termsVersion === TERMS_VERSION && acceptance.termsAcceptedAt != null;
}

export function termsHref(version: string = TERMS_VERSION) {
  return `/terms/${encodeURIComponent(version)}`;
}

export function getTermsVersion(version: string) {
  return TERMS_VERSIONS.find((entry) => entry.version === version);
}
