/** The app shell's content width, shared by app/layout.tsx's header, main
 * and footer.
 *
 * Not for dialogs; they take their width from ResponsiveDialog's `size`. */
export const PAGE_MAX_WIDTH_CLASS = "max-w-7xl";

/** The running-text measure for prose pages (about, contact, costs,
 * terms): the shell's max-w-7xl suits climb lists and is roughly twice a
 * comfortable line length. Callers centre it with `mx-auto w-full`. */
export const READING_MAX_WIDTH_CLASS = "max-w-2xl";
