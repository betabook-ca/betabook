/** Raw native form controls (<input>, <select>) that sit inside HeroUI
 * TextFields wear HeroUI's own `.input` class — the exact rules its Input
 * renders (field radius, background, shadow, border, hover/focus/invalid/
 * disabled states) — so a native select is indistinguishable from the styled
 * field beside it. A hand-rolled approximation used to give these a hairline
 * border and a smaller radius that HeroUI fields never had. */
export const FIELD_CLASS = "input";

/** One-line fields share responsive height, including the theme border. */
export const FIELD_HEIGHT_CLASS =
  "h-[calc(2.5rem+2*var(--border-width-field))] sm:h-[calc(2.25rem+2*var(--border-width-field))]";

/** Chips and toggles in a filter row match the one-line fields beside them. */
export const FILTER_PILL_CLASS = `${FIELD_HEIGHT_CLASS} inline-flex items-center`;

/** Field-like actions wear the field surface; the shadow yields to the focus ring. */
export const FIELD_SURFACE_CLASS =
  "rounded-field bg-field not-data-[focus-visible]:shadow-[var(--field-shadow)]";

/** Square actions use the same height as the adjacent field. */
export const FIELD_ACTION_CLASS = `${FIELD_HEIGHT_CLASS} w-[calc(2.5rem+2*var(--border-width-field))] sm:w-[calc(2.25rem+2*var(--border-width-field))]`;

/** Standard widths for search, filter and sort fields; shrink to their container. */
export const FIELD_WIDTH_CLASS = {
  short: "w-28 max-w-full min-w-0",
  medium: "w-44 max-w-full min-w-0",
  long: "w-96 max-w-full min-w-0",
} as const;

/** Shared label column; stack on phones so long controls retain usable space. */
export const FILTER_ROW_CLASS =
  "grid w-full grid-cols-1 items-start gap-2 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-3";
/** Match the first field's height, not the height of helper text or selected chips below it. */
export const FILTER_LABEL_CLASS =
  "text-sm font-medium text-foreground sm:flex sm:h-[calc(2.25rem+2*var(--border-width-field))] sm:items-center";
export const FILTER_CONTROL_CLASS = "sm:min-h-[calc(2.25rem+2*var(--border-width-field))]";
