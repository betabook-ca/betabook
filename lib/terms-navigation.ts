import { LANDING_PAGE_PATHS } from "@/lib/landing-pages";
import { DEFAULT_SIGNED_IN_PATH, safeNextPath } from "@/lib/sign-in-redirect";

export function termsNextPath(next?: string | string[]) {
  const path = safeNextPath(next);
  if (!path || /^\/(accept-terms|sign-in|sign-up)(?:[/?#]|$)/.test(path))
    return DEFAULT_SIGNED_IN_PATH;
  return path;
}

export function acceptTermsUrl(next?: string) {
  return `/accept-terms?next=${encodeURIComponent(termsNextPath(next))}`;
}

/** These pages remain usable without an agreement, including without JavaScript. */
export function isTermsExemptPath(path: string) {
  return (
    path === "/accept-terms" ||
    path === "/terms" ||
    path.startsWith("/terms/") ||
    // A shared project link is someone else's invitation, and the reader may
    // not even have an account. Blocking it behind this member's outstanding
    // agreement would break a link its owner sent to a person who is not the
    // subject of it. The page authorizes its own reader, and treats a member
    // who has not accepted as signed out.
    path.startsWith("/projects/") ||
    // A shared trip link is the same case as a shared project link: the reader
    // may not have an account, and the page authorizes its own reader.
    path.startsWith("/trips/") ||
    ["/contact", "/about", "/forgot-password", "/reset-password", ...LANDING_PAGE_PATHS].includes(
      path,
    )
  );
}
