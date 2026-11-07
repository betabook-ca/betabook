"use client";

import { Button, ComboBox, Input, Label, ListBox, useOverlayState } from "@heroui/react";
import { Check, CirclePlus, ListPlus, X } from "lucide-react";
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

/**
 * The climb page's secondary action beside Log. It opens a dialog whose
 * searchable dropdown scales to any number of lists: type to narrow them and
 * pick one to add the climb to the end of it, or pick a checked one to take
 * it off. The lists already holding the climb sit below as chips that remove
 * it. Every change saves on its own; lists load when the dialog opens.
 */
export function AddToListButton({
  climb,
  viewerId,
  fetcher = fetchChoices,
}: {
  climb: { id: number; name: string };
  /** The signed-in climber, whose lists it offers. */
  viewerId: string;
  /** For stories and tests. Production reads the climber's lists by API. */
  fetcher?: ClimbListChoicesFetcher;
}) {
  const state = useOverlayState();
  const createState = useOverlayState();
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<ClimbListChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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

  function toggle(choice: ClimbListChoice) {
    const adding = !choice.hasClimb;
    setError(null);
    setSaving(true);
    startTransition(async () => {
      const result = adding
        ? await addClimbToList(choice.id, climb.id)
        : await removeClimbFromList(choice.id, climb.id);
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setChoices(
        (current) =>
          current?.map((item) =>
            item.id === choice.id
              ? { ...item, hasClimb: adding, climbCount: item.climbCount + (adding ? 1 : -1) }
              : item,
          ) ?? current,
      );
    });
  }

  function reset() {
    setQuery("");
    setChoices(null);
    setError(null);
  }

  const needle = query.trim().toLocaleLowerCase();
  const matches = (choices ?? []).filter((choice) =>
    choice.title.toLocaleLowerCase().includes(needle),
  );
  const onLists = (choices ?? []).filter((choice) => choice.hasClimb);

  return (
    <>
      <Button variant="outline" className="gap-2" onPress={state.open}>
        <ListPlus aria-hidden className="size-5" />
        Add to list
      </Button>

      <ResponsiveDialog
        state={state}
        title={`Add ${climb.name} to a list`}
        size="sm"
        onClose={reset}
        footer={
          <div className="flex w-full flex-wrap justify-between gap-2">
            <Button
              variant="ghost"
              onPress={() => {
                state.close();
                createState.open();
              }}
            >
              <CirclePlus className="size-4" />
              New list…
            </Button>
            <Button onPress={state.close}>Done</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {choices === null && !error && <SkeletonListRows rows={2} />}
          {choices?.length === 0 && (
            <p className="text-sm text-muted">You have no lists yet. Make one to add this climb.</p>
          )}
          {choices && choices.length > 0 && (
            <>
              {onLists.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted">
                    On {onLists.length === 1 ? "1 list" : `${onLists.length} lists`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {onLists.map((choice) => (
                      <Button
                        key={choice.id}
                        size="sm"
                        variant="secondary"
                        className="max-w-full"
                        isDisabled={saving}
                        aria-label={`Remove from ${choice.title}`}
                        onPress={() => toggle(choice)}
                      >
                        <span className="truncate">{choice.title}</span>
                        <X aria-hidden className="size-3.5 shrink-0" />
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Not on any of your lists yet.</p>
              )}
              <ComboBox
                fullWidth
                allowsEmptyCollection
                menuTrigger="focus"
                inputValue={query}
                onInputChange={setQuery}
                selectedKey={null}
                items={matches}
                onSelectionChange={(key) => {
                  // One save at a time. The dropdown stays open after a pick,
                  // for adding to several lists; the chips above confirm it.
                  if (saving) return;
                  const choice = matches.find((item) => String(item.id) === key);
                  if (choice) {
                    toggle(choice);
                    setQuery("");
                  }
                }}
              >
                <Label>Your lists</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Search your lists…" />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox
                    className="max-h-72 overflow-y-auto"
                    renderEmptyState={() => (
                      <p className="px-3 py-2 text-sm text-muted">No lists match.</p>
                    )}
                  >
                    {(choice: ClimbListChoice) => (
                      <ListBox.Item
                        id={String(choice.id)}
                        textValue={choice.hasClimb ? `${choice.title}, on this list` : choice.title}
                      >
                        <span className="flex w-full min-w-0 items-center gap-2">
                          <Check
                            aria-hidden
                            className={`size-4 shrink-0 ${choice.hasClimb ? "" : "invisible"}`}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {choice.title}
                            {choice.hasClimb && <span className="sr-only">, on this list,</span>}
                          </span>
                          <span className="text-xs text-muted">
                            {climbCountLabel(choice.climbCount)}
                          </span>
                        </span>
                      </ListBox.Item>
                    )}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            </>
          )}
          {error && <InlineAlert>{error}</InlineAlert>}
        </div>
      </ResponsiveDialog>

      <ClimbListDialog
        state={createState}
        userId={viewerId}
        mode={{ kind: "create", climbId: climb.id }}
        onCreated={() => {
          setReload((count) => count + 1);
          state.open();
        }}
      />
    </>
  );
}
