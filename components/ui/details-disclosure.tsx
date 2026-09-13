"use client";

import { Disclosure } from "@heroui/react";
import type { ReactNode } from "react";

import { EYEBROW_CLASS } from "@/components/ui/eyebrow";

/** A closed-by-default section holding a form's optional fields, styled as
 * an eyebrow so it reads like the section headings around it. Controlled,
 * because the owning form must be able to reopen it when a hidden field
 * needs attention — a validation error, or editing a record that already
 * holds values in the section. Unlike CollapsibleSection, it stays
 * collapsible at every viewport size. */
export function DetailsDisclosure({
  title,
  isExpanded,
  onExpandedChange,
  children,
}: {
  title: string;
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Disclosure
      className="flex flex-col gap-3"
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
    >
      <Disclosure.Heading level={3} className="contents">
        <Disclosure.Trigger
          className={`flex min-h-11 w-fit cursor-pointer items-center gap-2 ${EYEBROW_CLASS}`}
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
