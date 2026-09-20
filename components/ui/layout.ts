/** The app shell's content width — app/layout.tsx's header, main and footer
 * share this one constant rather than repeating the class three times.
 *
 * Dialogs deliberately do *not* use it. They used to, which made a
 * three-field form 1280px wide on a desktop and gave it ~130-character line
 * lengths; a form's readable width and the shell's width are two different
 * measurements that only looked like one. See ResponsiveDialog's `size`. */
export const PAGE_MAX_WIDTH_CLASS = "max-w-7xl";
