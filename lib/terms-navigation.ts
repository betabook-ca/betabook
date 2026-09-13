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
    ["/contact", "/about", "/forgot-password", "/reset-password", ...LANDING_PAGE_PATHS].includes(
      path,
    )
  );
}
