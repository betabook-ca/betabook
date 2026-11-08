"use client";

import { Button, Checkbox, useOverlayState, type UseOverlayStateReturn } from "@heroui/react";
import { CirclePlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { addClimbToList, removeClimbFromList } from "@/actions";
import { ClimbListDialog } from "@/components/climb-lists/climb-list-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SkeletonListRows } from "@/components/ui/skeleton";
import type { ClimbListChoice } from "@/db/queries";
import { apiFetch } from "@/lib/api-client";
import { climbCountLabel } from "@/lib/climb-lists";

/** Reads the climber's lists for this climb. Swappable for stories and tests. */
export type ClimbListChoicesFetcher = (climbId: number) => Promise<ClimbListChoice[]>;

const fetchChoices: ClimbListChoicesFetcher = async (climbId) => {
  const response = await apiFetch(`/api/climbs/${climbId}/lists`);
  if (!response.ok) throw new Error("Couldn't load your lists.");
  return ((await response.json()) as { lists: ClimbListChoice[] }).lists;
};

/** One checkbox per list: checking adds the climb to the end of that list,
 * unchecking removes it. Each box saves on its own, so there is no Save
 * button to forget. Lists load when the dialog opens. */
export function AddToListDialog({
  state,
  userId,
  climb,
  fetcher = fetchChoices,
}: {
  state: UseOverlayStateReturn;
  userId: string;
  climb: { id: number; name: string };
  fetcher?: ClimbListChoicesFetcher;
}) {
  const createState = useOverlayState();
  const [choices, setChoices] = useState<ClimbListChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!state.isOpen) return;
    let cancelled = false;
    async function load() {
      try {
        const next = await fetcher(climb.id);
        if (!cancelled) setChoices(next);
      } catch {
        if (!cancelled) setError("Couldn't load your lists. Try again.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [state.isOpen, climb.id, fetcher, reload]);

  function toggle(choice: ClimbListChoice, selected: boolean) {
    setError(null);
    setSaving(choice.id);
    startTransition(async () => {
      const result = selected
        ? await addClimbToList(choice.id, climb.id)
        : await removeClimbFromList(choice.id, climb.id);
      setSaving(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      markSaved(choice.id, selected, result.value.climbCount);
    });
  }

  /** The count comes from the server, so a change already made in another
   * tab doesn't push it off by one. */
  function markSaved(listId: number, selected: boolean, climbCount: number) {
    setChoices(
      (current) =>
        current?.map((item) =>
          item.id === listId ? { ...item, hasClimb: selected, climbCount } : item,
        ) ?? current,
    );
  }

  function reset() {
    setChoices(null);
    setError(null);
  }

  return (
    <>
      <ResponsiveDialog
        state={state}
        title={`Add ${climb.name} to a list`}
        size="sm"
        onClose={reset}
        footer={
          <div className="flex w-full flex-wrap justify-between gap-2">
            <Button variant="ghost" onPress={createState.open}>
              <CirclePlus className="size-4" />
              New list…
            </Button>
            <Button onPress={state.close}>Done</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {choices === null && !error && <SkeletonListRows rows={3} />}
          {choices?.length === 0 && (
            <p className="text-sm text-muted">You have no lists yet. Make one to add this climb.</p>
          )}
          {choices && choices.length > 0 && (
            <ul className="flex flex-col gap-1">
              {choices.map((choice) => (
                <li key={choice.id}>
                  <Checkbox
                    isSelected={choice.hasClimb}
                    isDisabled={saving !== null}
                    onChange={(selected) => toggle(choice, selected)}
                  >
                    <Checkbox.Content className="flex min-h-11 w-full items-center gap-3">
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                      <span className="min-w-0 flex-1 truncate">{choice.title}</span>
                      <span className="text-sm text-muted">
                        {climbCountLabel(choice.climbCount)}
                      </span>
                    </Checkbox.Content>
                  </Checkbox>
                </li>
              ))}
            </ul>
          )}
          {error && <InlineAlert>{error}</InlineAlert>}
        </div>
      </ResponsiveDialog>

      <ClimbListDialog
        state={createState}
        userId={userId}
        mode={{ kind: "create", climbId: climb.id }}
        onCreated={() => setReload((count) => count + 1)}
      />
    </>
  );
}
