"use client";

import { Button } from "@heroui/react";
import { useEffect, useRef, useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { DetailsDisclosure } from "@/components/ui/details-disclosure";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { GoalContribution, GoalProgress } from "@/lib/goals";
import { areaHref } from "@/lib/slug";
import { fetchApi } from "@/spa/lib/api";

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
      const data = await fetchApi("/api/users/{id}/goals", {
        path: { id: ownerId },
        query: { goalId: goal.id, periodStart: goal.periodStart, periodEnd: goal.periodEnd },
        sessionEvents: true,
      });
      if (!("items" in data)) throw new Error("Couldn't load this goal's items.");
      if (request === requestId.current) setItems(data.items);
    } catch (cause) {
      if (request === requestId.current)
        setError(
          cause instanceof Error && "status" in cause
            ? "Couldn't load this goal's items."
            : cause instanceof Error
              ? cause.message
              : "Couldn't load items.",
        );
    }
  }
  return (
    <DetailsDisclosure
      density="compact"
      title={`${goal.progress} ${goal.kind === "new-areas" ? "area" : "climb"}${goal.progress === 1 ? "" : "s"}`}
      isExpanded={expanded}
      onExpandedChange={toggle}
    >
      {error ? (
        <InlineAlert
          action={
            <Button
              size="sm"
              onPress={() => {
                void toggle(true);
              }}
            >
              Try again
            </Button>
          }
        >
          {error}
        </InlineAlert>
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
  );
}
