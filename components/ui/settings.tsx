import { clsx } from "clsx";
import type { ReactNode } from "react";

import { cardClass } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/typography";

/** Rows own their vertical padding so a component that renders several rows
 * (PrivacyFields) divides evenly with the rows around it. */
export const SETTINGS_ROW_CLASS = "py-4";

/** Border, not separator: the dark separator matches the quiet panel fill. */
export const SETTINGS_ROWS_CLASS = "flex min-w-0 flex-col divide-y divide-border";

export const SETTINGS_SECTION_CLASS = "grid gap-3 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-8";

export const SETTINGS_PANEL_BODY_CLASS = `${SETTINGS_ROWS_CLASS} px-4 py-1 sm:px-6 sm:py-2`;

export function settingsPanelClass(tone: "default" | "danger" = "default"): string {
  return clsx(
    "min-w-0",
    tone === "danger" ? "rounded-panel border border-danger/30 bg-danger/5" : cardClass("none"),
  );
}

/** Children are rows; the panel draws the hairlines between them. */
export function SettingsSection({
  id,
  title,
  tone = "default",
  children,
}: {
  id: string;
  title: string;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={SETTINGS_SECTION_CLASS}>
      <SectionHeading id={`${id}-heading`} className="lg:pt-5">
        {title}
      </SectionHeading>
      <div className={settingsPanelClass(tone)}>
        <div className={SETTINGS_PANEL_BODY_CLASS}>{children}</div>
      </div>
    </section>
  );
}

/** Controls that carry their own label (text fields, selects, switches) use
 * SETTINGS_ROW_CLASS instead, so the label stays associated. */
export function SettingsRow({
  title,
  description,
  inline = false,
  children,
}: {
  title?: string;
  description?: ReactNode;
  /** Keeps a compact control beside its text on phones. */
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        SETTINGS_ROW_CLASS,
        "flex gap-x-6 gap-y-3",
        inline ? "items-center justify-between" : "flex-col sm:flex-row sm:items-center",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <h3 className="text-sm font-medium wrap-anywhere">{title}</h3>}
        {description && <p className="text-sm text-pretty text-muted">{description}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:max-w-xs sm:justify-end">
        {children}
      </div>
    </div>
  );
}
