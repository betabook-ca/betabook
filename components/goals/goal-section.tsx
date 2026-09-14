"use client";

import { Disclosure } from "@heroui/react";
import type { ReactNode } from "react";

import { cardClass } from "@/components/ui/card";
import { EYEBROW_CLASS } from "@/components/ui/eyebrow";

/** The heading stays visible; goal actions collapse with the goal list. */
export function GoalSection({
  title,
  expanded,
  onExpandedChange,
  hasGoals,
  activeCount,
  action,
  navigation,
  children,
}: {
  title: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  hasGoals: boolean;
  activeCount: number;
  action?: ReactNode;
  navigation?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Disclosure
      isExpanded={expanded}
      onExpandedChange={onExpandedChange}
      className="flex flex-col gap-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {hasGoals ? (
          <Disclosure.Heading level={2} className="contents">
            <Disclosure.Trigger
              className={`flex min-h-6 w-fit cursor-pointer items-start gap-2 ${EYEBROW_CLASS}`}
            >
              <span>
                {title}
                {!expanded && (
                  <span className="font-normal tracking-normal normal-case">
                    {" "}
                    · {activeCount} active
                  </span>
                )}
              </span>
              <Disclosure.Indicator className="ms-0 size-4" />
            </Disclosure.Trigger>
          </Disclosure.Heading>
        ) : (
          <h2 className={`flex min-h-6 items-start ${EYEBROW_CLASS}`}>{title}</h2>
        )}
      </div>
      {hasGoals ? (
        <Disclosure.Content>
          <Disclosure.Body style={{ padding: 0 }}>
            <div className={`flex flex-col gap-0 p-2 ${cardClass("none")}`}>
              {(navigation || action) && (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">{navigation}</div>
                  {action && <div className="shrink-0">{action}</div>}
                </div>
              )}
              {children}
            </div>
          </Disclosure.Body>
        </Disclosure.Content>
      ) : (
        <div className={`flex items-center justify-between gap-2 p-2 ${cardClass("none")}`}>
          <p className="text-xs font-normal text-muted">No goals set yet.</p>
          {action}
        </div>
      )}
    </Disclosure>
  );
}
