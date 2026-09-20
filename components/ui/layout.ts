/** The app shell's content width, shared by app/layout.tsx's header, main
 * and footer.
 *
 * Don't use this for dialogs. They used to, which made a three-field form
 * 1280px wide on desktop with ~130-character lines. Dialog widths come from
 * ResponsiveDialog's `size` instead. */
export const PAGE_MAX_WIDTH_CLASS = "max-w-7xl";
