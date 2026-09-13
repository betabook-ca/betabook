/** Choose by purpose, not by page. Ordinary panels never cast a shadow.
 * Only floating content uses elevation; all treatments retain rounded-panel. */
const CARD_SURFACE = {
  quiet: "bg-surface-secondary",
  bordered: "border border-border bg-surface",
  inset: "bg-surface-tertiary",
  floating: "border border-border bg-overlay shadow-lg",
} as const;

/** Card paddings: `sm` for dense stat cards and expanded filter panels,
 * `md` for forms and settings, `fluid` for wide analytics cards that need
 * room on desktop but not on a phone. */
export const CARD_PADDING = {
  /** Edge-to-edge lists own their header and row padding. */
  none: "p-0",
  sm: "p-4",
  md: "p-6",
  fluid: "p-4 sm:p-6",
} as const;

export function cardClass(
  padding: keyof typeof CARD_PADDING = "md",
  surface: keyof typeof CARD_SURFACE = "quiet",
): string {
  return `rounded-panel ${CARD_SURFACE[surface]} ${CARD_PADDING[padding]}`;
}

/** Narrow centered card for auth/account-style single-purpose pages. */
export const FORM_CARD_CLASS = `mx-auto flex max-w-sm flex-col gap-4 ${cardClass("md")}`;

/** Full-width surface card for entity forms. */
export const SURFACE_CARD_CLASS = `flex flex-col gap-4 ${cardClass("md")}`;
