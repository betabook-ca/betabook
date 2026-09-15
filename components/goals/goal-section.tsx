"use client";

import type { ReactNode } from "react";

import { cardClass } from "@/components/ui/card";

export function GoalSection({
  hasGoals,
  action,
  navigation,
  children,
}: {
  hasGoals: boolean;
  action: ReactNode;
  navigation: ReactNode;
  children: ReactNode;
}) {
  if (!hasGoals) {
    return (
      <section
        aria-label="My goals"
        className="flex max-w-160 flex-col items-start gap-2 rounded-panel bg-surface-secondary p-5 sm:p-6"
      >
        <h2 className="text-lg font-semibold">Set your first goal</h2>
        <p className="text-sm text-muted">
          Choose a climbing or training target and track progress from your logs.
        </p>
        <div className="mt-2">{action}</div>
      </section>
    );
  }
  return (
    <section aria-label="My goals" className="flex flex-col gap-0">
      <h2 className="sr-only">My goals</h2>
      <div className={`flex flex-col gap-0 p-2 ${cardClass("none")}`}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">{navigation}</div>
          <div className="shrink-0">{action}</div>
        </div>
        {children}
      </div>
    </section>
  );
}
