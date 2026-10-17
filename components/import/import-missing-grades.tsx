"use client";

import { Checkbox } from "@heroui/react";

import { Grade } from "@/components/ui/grade";
import type { ClimbCandidate } from "@/db/queries";
import { formatCount } from "@/lib/format";
import { formatGrade } from "@/lib/grades";

import { TEXT_BUTTON_CLASS } from "./text-button";

/** A blank suggested grade in a Betabook export or a hand-made file means "no
 * grade given", so the fallback to the listed grade is offered, not assumed. */
export function ImportMissingGrades({
  climbs,
  useListedGrade,
  onChange,
  disabled = false,
}: {
  climbs: readonly ClimbCandidate[];
  useListedGrade: boolean;
  onChange: (useListedGrade: boolean) => void;
  disabled?: boolean;
}) {
  if (!climbs.length) return null;
  return (
    <section aria-label="Sends without a suggested grade" className="flex flex-col gap-2">
      <details>
        <summary className={`${TEXT_BUTTON_CLASS} text-sm`}>
          {formatCount(climbs.length, "send")} {climbs.length === 1 ? "has" : "have"} no suggested
          grade
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {climbs.map((climb) => (
            <li key={climb.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 wrap-break-word">
                <span className="block text-sm text-foreground">{climb.name}</span>
                <span className="block text-xs text-muted">{climb.areaName}</span>
              </span>
              <Grade>{formatGrade(climb.type, climb.grade)}</Grade>
            </li>
          ))}
        </ul>
      </details>
      <Checkbox isSelected={useListedGrade} isDisabled={disabled} onChange={onChange}>
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <span className="text-sm">Use the climb&rsquo;s listed grade</span>
        </Checkbox.Content>
      </Checkbox>
      <p className="text-xs text-muted">
        {useListedGrade
          ? "These sends will import with the grade shown, as when you log a send."
          : "These sends will import without a suggested grade."}
      </p>
    </section>
  );
}
