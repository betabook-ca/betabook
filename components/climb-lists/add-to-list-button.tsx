"use client";

import { Button, Menu, useOverlayState } from "@heroui/react";
import { CirclePlus, ListPlus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  Autocomplete,
  MenuTrigger,
  Popover,
  useFilter,
  type Selection,
} from "react-aria-components";

import { addClimbToList, removeClimbFromList } from "@/actions";
import { ClimbListDialog } from "@/components/climb-lists/climb-list-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { QueryInput } from "@/components/ui/query-input";
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
 * The climb page's secondary action beside Log. It opens a searchable
 * dropdown of the climber's lists, so it stays usable at a hundred lists:
 * type to narrow them, and pick one to add the climb to the end of it or,
 * when it is already checked, to take the climb off. Each pick saves on its
 * own and the dropdown stays open for the next. Lists load when it opens.
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
  const createState = useOverlayState();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<ClimbListChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [, startTransition] = useTransition();
  const { contains } = useFilter({ sensitivity: "base" });

  useEffect(() => {
    if (!open) return;
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
  }, [open, climb.id, fetcher, reload]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setError(null);
    }
  }

  function toggle(choice: ClimbListChoice) {
    const adding = !choice.hasClimb;
    setError(null);
    setSaving(choice.id);
    startTransition(async () => {
      const result = adding
        ? await addClimbToList(choice.id, climb.id)
        : await removeClimbFromList(choice.id, climb.id);
      setSaving(null);
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

  /** One pick changes one list; find it by comparing against what's saved. */
  function handleSelection(keys: Selection) {
    if (!choices || keys === "all") return;
    const changed = choices.find((choice) => keys.has(String(choice.id)) !== choice.hasClimb);
    if (changed) toggle(changed);
  }

  return (
    <>
      <MenuTrigger isOpen={open} onOpenChange={handleOpenChange}>
        <Button variant="outline" className="gap-2">
          <ListPlus aria-hidden className="size-5" />
          Add to list
        </Button>
        <Popover className="popover w-80 max-w-[calc(100vw-2rem)]" placement="bottom end">
          <div className="flex flex-col gap-2 p-2">
            {choices === null && !error && <SkeletonListRows rows={3} />}
            {choices?.length === 0 && (
              <p className="px-2 py-1 text-sm text-muted">
                You have no lists yet. Make one to add this climb.
              </p>
            )}
            {choices && choices.length > 0 && (
              <Autocomplete filter={contains} inputValue={query} onInputChange={setQuery}>
                <QueryInput
                  label="Search your lists"
                  placeholder="Search your lists…"
                  value={query}
                  onChange={setQuery}
                  className="w-full"
                  // oxlint-disable-next-line jsx-a11y/no-autofocus -- typing narrows the lists as soon as the dropdown opens
                  inputProps={{ autoFocus: true }}
                />
                <Menu.Root
                  selectionMode="multiple"
                  shouldCloseOnSelect={false}
                  items={choices}
                  selectedKeys={choices.filter((c) => c.hasClimb).map((c) => String(c.id))}
                  disabledKeys={saving === null ? [] : choices.map((c) => String(c.id))}
                  onSelectionChange={handleSelection}
                  renderEmptyState={() => (
                    <p className="px-3 py-2 text-sm text-muted">No lists match.</p>
                  )}
                  className="max-h-72 overflow-y-auto"
                >
                  {(choice: ClimbListChoice) => (
                    <Menu.Item id={String(choice.id)} textValue={choice.title}>
                      <span className="min-w-0 flex-1 truncate">{choice.title}</span>
                      <span className="text-xs text-muted">
                        {climbCountLabel(choice.climbCount)}
                      </span>
                      <Menu.ItemIndicator />
                    </Menu.Item>
                  )}
                </Menu.Root>
              </Autocomplete>
            )}
            {error && <InlineAlert>{error}</InlineAlert>}
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2"
              onPress={() => {
                handleOpenChange(false);
                createState.open();
              }}
            >
              <CirclePlus aria-hidden className="size-4" />
              New list…
            </Button>
          </div>
        </Popover>
      </MenuTrigger>

      <ClimbListDialog
        state={createState}
        userId={viewerId}
        mode={{ kind: "create", climbId: climb.id }}
        onCreated={() => {
          setChoices(null);
          setReload((count) => count + 1);
        }}
      />
    </>
  );
}
