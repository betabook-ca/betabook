"use client";

import { useEffect, useRef, useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { DetailsDisclosure } from "@/components/ui/details-disclosure";
import { InlineAlert } from "@/components/ui/inline-alert";
import { apiFetch } from "@/lib/api-client";
import type { GoalContribution, GoalProgress } from "@/lib/goals";
import { areaHref } from "@/lib/slug";

export function GoalItems({
  ownerId,
  goal,
  loadItems,
}: {
  ownerId: string;
  goal: GoalProgress;
  loadItems?: (goal: GoalProgress) => Promise<GoalContribution[]>;
}) {
  const requestId = useRef(0);
  const [source, setSource] = useState(goal);
  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [goal],
  );
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<GoalContribution[] | null>(null);
  const [error, setError] = useState("");
  if (source !== goal) {
    setSource(goal);
    setExpanded(false);
    setItems(null);
    setError("");
  }
  if (goal.kind === "training" || goal.kind === "days") return null;
  async function toggle(open: boolean) {
    requestId.current += 1;
    const request = requestId.current;
    setExpanded(open);
    setItems(null);
    setError("");
    if (!open) return;
    try {
      if (loadItems) {
        const loaded = await loadItems(goal);
        if (request === requestId.current) setItems(loaded);
        return;
      }
      const params = new URLSearchParams({
        goalId: String(goal.id),
        periodStart: goal.periodStart,
        periodEnd: goal.periodEnd,
      });
      const res = await apiFetch(`/api/users/${ownerId}/goals?${params}`);
      if (!res.ok) throw new Error("Could not load this goal’s items. Close and reopen to retry.");
      const data = (await res.json()) as { items: GoalContribution[] };
      if (request === requestId.current) setItems(data.items);
    } catch (cause) {
      if (request === requestId.current)
        setError(cause instanceof Error ? cause.message : "Could not load items.");
    }
  }
  return (
    <div className="[&_button]:min-h-6 [&_button]:tracking-normal [&_button]:normal-case [&>*]:gap-0">
      <DetailsDisclosure
        title={`${goal.progress} ${goal.kind === "new-areas" ? "area" : "climb"}${goal.progress === 1 ? "" : "s"}`}
        isExpanded={expanded}
        onExpandedChange={toggle}
      >
        {error ? (
          <InlineAlert>{error}</InlineAlert>
        ) : items === null ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={`${item.type}-${item.id}`} className="text-xs">
                {item.type === "area" ? (
                  <AppLink href={areaHref(item.id, item.name)}>{item.name}</AppLink>
                ) : (
                  <span>{item.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </DetailsDisclosure>
    </div>
  );
}
