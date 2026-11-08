"use client";

import { Button, ComboBox, Input, Label, ListBox, toast, useOverlayState } from "@heroui/react";
import { CirclePlus, ListPlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import type { Key } from "react-aria-components";

import { addClimbToList } from "@/actions";
import { ClimbListDialog } from "@/components/climb-lists/climb-list-dialog";
import { AppLink } from "@/components/ui/app-link";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SkeletonListRows } from "@/components/ui/skeleton";
import type { ClimbListChoice } from "@/db/queries";
import { apiFetch } from "@/lib/api-client";
import { climbCountLabel, climbListHref } from "@/lib/climb-lists";

/** Reads the climber's lists for this climb. Swappable for stories and tests. */
export type ClimbListChoicesFetcher = (climbId: number) => Promise<ClimbListChoice[]>;

const fetchChoices: ClimbListChoicesFetcher = async (climbId) => {
  const response = await apiFetch(`/api/climbs/${climbId}/lists`);
  if (!response.ok) throw new Error("Couldn't load your lists.");
  return ((await response.json()) as { lists: ClimbListChoice[] }).lists;
};

/** Says where the climb went, with the list as a link to it. */
function announceAdded(climbName: string, userId: string, list: { id: number; title: string }) {
  toast.success(
    <span>
      Added {climbName} to{" "}
      <AppLink href={climbListHref(userId, list.id)} className="font-medium underline">
        {list.title}
      </AppLink>
    </span>,
  );
}

/**
 * The climb page's secondary action beside Log. It opens a dialog with a
 * searchable dropdown of the climber's lists, which scales to any number of
 * them: type to narrow, choose one list, then Add. Lists already holding the
 * climb are shown but can't be chosen. New list… makes a list with the climb
 * already on it. Either way the dialog closes and a toast links to the list.
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
  const [choices, setChoices] = useState<ClimbListChoice[] | null>(null);
  const [selected, setSelected] = useState<Key | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
  }, [state.isOpen, climb.id, fetcher]);

  const list = choices?.find((choice) => String(choice.id) === selected) ?? null;

  function add() {
    if (!list || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await addClimbToList(list.id, climb.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      state.close();
      announceAdded(climb.name, viewerId, list);
    });
  }

  function reset() {
    setChoices(null);
    setSelected(null);
    setError(null);
  }

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
        isPending={pending}
        onClose={reset}
        footer={
          <div className="flex w-full flex-wrap justify-between gap-2">
            <Button
              variant="ghost"
              isDisabled={pending}
              onPress={() => {
                state.close();
                createState.open();
              }}
            >
              <CirclePlus className="size-4" />
              New list…
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" isDisabled={pending} onPress={state.close}>
                Cancel
              </Button>
              <Button isDisabled={!list || pending} onPress={add}>
                Add
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {choices === null && !error && <SkeletonListRows rows={2} />}
          {choices?.length === 0 && (
            <p className="text-sm text-muted">
              You have no lists yet. Make one with New list… and this climb goes on it.
            </p>
          )}
          {choices && choices.length > 0 && (
            <ComboBox
              fullWidth
              allowsEmptyCollection
              menuTrigger="focus"
              defaultItems={choices}
              selectedKey={selected}
              onSelectionChange={setSelected}
              disabledKeys={choices.filter((c) => c.hasClimb).map((c) => String(c.id))}
              isDisabled={pending}
            >
              <Label>List</Label>
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
                    <ListBox.Item id={String(choice.id)} textValue={choice.title}>
                      <span className="flex w-full min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{choice.title}</span>
                        <span className="text-xs text-muted">
                          {choice.hasClimb
                            ? "Already on this list"
                            : climbCountLabel(choice.climbCount)}
                        </span>
                      </span>
                    </ListBox.Item>
                  )}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          )}
          {error && <InlineAlert>{error}</InlineAlert>}
        </div>
      </ResponsiveDialog>

      <ClimbListDialog
        state={createState}
        userId={viewerId}
        mode={{ kind: "create", climbId: climb.id }}
        onCreated={(id, title) => announceAdded(climb.name, viewerId, { id, title })}
      />
    </>
  );
}
