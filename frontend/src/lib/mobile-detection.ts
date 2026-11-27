export type MobilePlatform = "ios" | "android" | "other";
export type MobileBrowser = "chrome" | "safari" | "other";

const MOBILE_HELPER_DISMISS_KEY = "betabook:hide-mobile-app-helper";

/**
 * Whether the primary pointer is touch-like. This is what actually separates a
 * touch-first device from a desktop browser sending the same desktop-class
 * user agent: macOS stays `pointer: fine` however many touch points it claims,
 * while iPadOS reports coarse even with a trackpad attached.
 */
function hasCoarsePointer(): boolean {
  if (typeof window === "undefined" || window.matchMedia == null) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function detectMobilePlatform(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
  platform = typeof navigator !== "undefined" ? (navigator.platform ?? "") : "",
  maxTouchPoints = typeof navigator !== "undefined" ? (navigator.maxTouchPoints ?? 0) : 0,
  coarsePointer = hasCoarsePointer(),
): MobilePlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || /iPhone|iPad|iPod/i.test(platform)) {
    return "ios";
  }
  // iPadOS 13+ reports a Mac user agent. Touch points alone can't settle it:
  // a Mac reports them for an attached touchscreen or screen-sharing display,
  // and would then be offered a home screen it hasn't got.
  if (
    (/Macintosh|MacIntel/i.test(platform) || /Macintosh|MacIntel/i.test(userAgent)) &&
    maxTouchPoints > 1 &&
    coarsePointer
  ) {
    return "ios";
  }
  if (/Android/i.test(userAgent) || /Android/i.test(platform)) {
    return "android";
  }
  return "other";
}

export function detectMobileBrowser(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
): MobileBrowser {
  // Chrome on iOS uses "CriOS"
  if (/CriOS/i.test(userAgent)) {
    return "chrome";
  }
  // Chrome on Android / Chromium-based browsers, excluding Edge, Opera, Samsung Internet
  if (/Chrome|Chromium/i.test(userAgent) && !/EdgA|OPR|SamsungBrowser|UCBrowser/i.test(userAgent)) {
    return "chrome";
  }
  // Safari: contains Safari, but not Chrome, Chromium, Firefox, Edge, Opera, or Samsung
  if (
    /Safari/i.test(userAgent) &&
    !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|SamsungBrowser|UCBrowser/i.test(userAgent)
  ) {
    return "safari";
  }
  return "other";
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined" || window.matchMedia == null) return false;
  const isStandaloneMatch =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches;
  const isNavStandalone =
    typeof navigator !== "undefined" &&
    "standalone" in navigator &&
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isStandaloneMatch || isNavStandalone;
}

export function isMobileDevice(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
  platform = typeof navigator !== "undefined" ? (navigator.platform ?? "") : "",
  maxTouchPoints = typeof navigator !== "undefined" ? (navigator.maxTouchPoints ?? 0) : 0,
  coarsePointer = hasCoarsePointer(),
): boolean {
  return (
    detectMobilePlatform(userAgent, platform, maxTouchPoints, coarsePointer) !== "other" ||
    /webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
  );
}

export function isMobileHelperDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(MOBILE_HELPER_DISMISS_KEY) === "true";
  } catch {
    return false;
  }
}

export function setMobileHelperDismissed(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(MOBILE_HELPER_DISMISS_KEY, "true");
  } catch {
    // Ignore storage quota or privacy errors
  }
}
