import { clsx } from "clsx";

/** The pill-shaped choice: a bordered, muted pill that lights up in its
 * tag's own color when chosen. One look for every chip-shaped selector —
 * discipline filters (multi-select), the analytics discipline nav (links),
 * and the send form's ascent style (radio) — so "pick a tag" reads the same
 * wherever it appears. `selectedClassName` is the bg/fg pair the matching
 * display chip wears, so a chosen pill is the tag it stands for. */
export function choicePillClass(selected: boolean, selectedClassName: string): string {
  return clsx(
    "cursor-pointer rounded-full border px-3 py-1 text-sm no-underline transition-colors focus-visible:status-focused",
    selected
      ? `border-transparent font-medium ${selectedClassName}`
      : "border-border font-normal text-muted hover:text-foreground",
  );
}
