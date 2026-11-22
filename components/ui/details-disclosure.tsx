"use client";

import { Disclosure } from "@heroui/react";
import { clsx } from "clsx";
import type { ReactNode } from "react";

import { EYEBROW_CLASS } from "@/components/ui/eyebrow";

/** A closed-by-default section holding a form's optional fields, styled as
 * an eyebrow so it reads like the section headings around it. Controlled,
 * because the owning form must be able to reopen it when a hidden field
 * needs attention — a validation error, or editing a record that already
 * holds values in the section. Unlike CollapsibleSection, it stays
 * collapsible at every viewport size.
 *
 * `density="compact"` is the inline form for a summary inside a list row,
 * such as a goal's items or its history: a small sentence-case trigger with
 * the body right under it. Only the trigger shrinks; buttons in the body
 * keep their own size and tap target. */
export function DetailsDisclosure({
  title,
  isExpanded,
  onExpandedChange,
  density = "default",
  children,
}: {
  title: string;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  density?: "default" | "compact";
  children: ReactNode;
}) {
  const compact = density === "compact";
  return (
    <Disclosure
      className={clsx("flex flex-col", compact ? "gap-0" : "gap-3")}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
    >
      <Disclosure.Heading level={3} className="contents">
        <Disclosure.Trigger
          className={clsx(
            "flex w-fit cursor-pointer items-center gap-2",
            compact ? "min-h-6 text-xs font-medium text-muted" : `min-h-11 ${EYEBROW_CLASS}`,
          )}
        >
          {title}
          <Disclosure.Indicator className="ms-0 size-4" />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="flex flex-col gap-4" style={{ padding: 0 }}>
          {children}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
