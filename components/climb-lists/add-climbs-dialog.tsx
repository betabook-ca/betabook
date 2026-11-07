"use client";

import type { UseOverlayStateReturn } from "@heroui/react";
import { useMemo, useState, useTransition } from "react";

import { addClimbToList } from "@/actions";
import { ClimbPicker } from "@/components/climb-picker";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { useCompactViewport } from "@/hooks/use-compact-viewport";

/** Searches the catalog and appends each climb picked to the end of the list.
 * Stays open after each add, because a list is usually built several climbs
 * at a time. Fullscreen: with the keyboard up, a sheet would show about three
 * results. */
export function AddClimbsDialog({
  state,
  listId,
  listTitle,
  climbIds,
}: {
  state: UseOverlayStateReturn;
  listId: number;
  listTitle: string;
  /** Already on the list, so the picker says so instead of adding twice. */
  climbIds: readonly number[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ id: number; name: string }[]>([]);
  const [pending, startTransition] = useTransition();
  const compact = useCompactViewport();

  const onList = useMemo(
    () =>
      new Map(
        [...climbIds, ...added.map((climb) => climb.id)].map((id) => [id, "On this list"] as const),
      ),
    [climbIds, added],
  );

  function handleAdd(climb: { id: number; name: string }) {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await addClimbToList(listId, climb.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAdded((current) => [...current, climb]);
    });
  }

  function reset() {
    setError(null);
    setAdded([]);
  }

  const last = added.at(-1);

  return (
    <ResponsiveDialog
      state={state}
      title={`Add climbs to ${listTitle}`}
      size="lg"
      presentation="fullscreen"
      isPending={pending}
      onClose={reset}
    >
      <div className="flex flex-col gap-3">
        <ClimbPicker
          allowSentClimbs
          showFilters={!compact}
          disabledClimbIds={onList}
          onPick={(climb) => handleAdd(climb)}
        />
        {error && <InlineAlert>{error}</InlineAlert>}
        <p role="status" className="text-sm text-muted">
          {pending ? "Adding…" : last ? `Added ${last.name}.` : ""}
        </p>
      </div>
    </ResponsiveDialog>
  );
}
