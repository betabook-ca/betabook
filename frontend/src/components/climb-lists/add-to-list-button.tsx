"use client";

import { Button, ComboBox, Input, Label, ListBox, useOverlayState } from "@heroui/react";
import { CirclePlus, ListPlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import type { Key } from "react-aria-components";

import { ClimbListDialog } from "@/components/climb-lists/climb-list-dialog";
import { AppLink } from "@/components/ui/app-link";
import { InlineAlert } from "@/components/ui/inline-alert";
import { DialogActions, ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { SkeletonListRows } from "@/components/ui/skeleton";
import { useToastQueue } from "@/components/ui/viewer-toasts";
import { useViewGuard } from "@/hooks/use-view-guard";
import { climbCountLabel, climbListHref } from "@/lib/climb-lists";
import { addClimbToList } from "@/spa/lib/actions-client";
import { fetchApi, type ApiResponse } from "@/spa/lib/api";

type ClimbListChoice = ApiResponse<"/api/climbs/{id}/lists">["lists"][number];

/** Reads the climber's lists for this climb. Swappable for stories and tests. */
export type ClimbListChoicesFetcher = (climbId: number) => Promise<ClimbListChoice[]>;

const fetchChoices: ClimbListChoicesFetcher = async (climbId) => {
  try {
    const response = await fetchApi("/api/climbs/{id}/lists", {
      path: { id: String(climbId) },
      sessionEvents: true,
    });
    return response.lists;
  } catch (error) {
    if (error instanceof Error && "status" in error)
      throw new Error("Couldn't load your lists.", { cause: error });
    throw error;
  }
};

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
  const queue = useToastQueue();
  const captureView = useViewGuard(viewerId, climb.id);
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

  function announceAdded(list: { id: number; title: string }) {
    queue.add(
      {
        variant: "success",
        title: (
          <span>
            Added {climb.name} to{" "}
            <AppLink href={climbListHref(viewerId, list.id)} className="font-medium underline">
              {list.title}
            </AppLink>
          </span>
        ),
      },
      { timeout: 4000 },
    );
  }

  function add() {
    if (!list || pending) return;
    setError(null);
    const isCurrent = captureView();
    startTransition(async () => {
      const result = await addClimbToList(list.id, climb.id);
      if (!isCurrent()) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      state.close();
      announceAdded(list);
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
          <DialogActions
            leading={
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
            }
          >
            <Button variant="ghost" isDisabled={pending} onPress={state.close}>
              Cancel
            </Button>
            <Button isDisabled={!list || pending} onPress={add}>
              Add
            </Button>
          </DialogActions>
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
        onCreated={announceAdded}
      />
    </>
  );
}
