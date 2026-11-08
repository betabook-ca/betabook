"use client";

import { Button, type UseOverlayStateReturn } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { copyClimbList, createClimbList, updateClimbList } from "@/actions";
import { ClimbListForm, type ClimbListDraft } from "@/components/climb-lists/climb-list-form";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { climbListHref, copyClimbListTitle } from "@/lib/climb-lists";

type ListFields = { id: number; title: string; description: string | null };

/** Where a copy reads its climbs from: the list by id, for a reader who can
 * see it on the owner's profile, or the share link, for one who reached it
 * that way. A link copy carries no list id, so a shared page never sends one. */
export type ClimbListCopySource = { listId: number } | { token: string };

/** What the dialog does. Copying takes the source's climbs in circuit order; the
 * name and description start as the source's and are the copier's to change. */
export type ClimbListDialogMode =
  | { kind: "create"; climbId?: number }
  | { kind: "edit"; list: ListFields }
  | {
      kind: "copy";
      list: Omit<ListFields, "id"> & { climbCount: number };
      /** True when copying your own list, which adds " (copy)" to the name. */
      own: boolean;
      source: ClimbListCopySource;
    };

function draftFor(mode: ClimbListDialogMode): ClimbListDraft {
  if (mode.kind === "create") return { title: "", description: "" };
  const description = mode.list.description ?? "";
  if (mode.kind === "edit") return { title: mode.list.title, description };
  return { title: copyClimbListTitle(mode.list.title, { own: mode.own }), description };
}

const TITLES = { create: "New list", edit: "Edit list", copy: "Copy list" } as const;
const ACTIONS = { create: "Create list", edit: "Save changes", copy: "Copy list" } as const;

/** Creates, edits or copies a list. A new list and a copy open themselves on
 * success, because the reason to make one is to look at it; an edit stays
 * put. */
export function ClimbListDialog({
  state,
  userId,
  mode,
  onCreated,
}: {
  state: UseOverlayStateReturn;
  /** The signed-in climber, who owns whatever this creates. */
  userId: string;
  mode: ClimbListDialogMode;
  /** Replaces the default navigation to the new list, as the Add to list
   * drawer does to stay on the climb page. */
  onCreated?: (listId: number, title: string) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ClimbListDraft>(() => draftFor(mode));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [wasOpen, setWasOpen] = useState(state.isOpen);

  // Reset each time the dialog opens, as TripDialog does.
  if (state.isOpen !== wasOpen) {
    setWasOpen(state.isOpen);
    if (state.isOpen) {
      setDraft(draftFor(mode));
      setError(null);
    }
  }

  const incomplete = !draft.title.trim();

  function save() {
    const input = { title: draft.title, description: draft.description };
    if (mode.kind === "create") return createClimbList(input, { climbId: mode.climbId });
    if (mode.kind === "edit")
      return updateClimbList(mode.list.id, input).then((result) =>
        result.ok ? { ok: true as const, value: mode.list.id } : result,
      );
    return copyClimbList(mode.source, input);
  }

  function handleSave() {
    if (pending || incomplete) return;
    setError(null);
    startTransition(async () => {
      const result = await save();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      state.close();
      if (mode.kind === "edit") router.refresh();
      else if (onCreated) onCreated(result.value, draft.title.replace(/\s+/g, " ").trim());
      else router.push(climbListHref(userId, result.value));
    });
  }

  return (
    <ResponsiveDialog
      state={state}
      title={TITLES[mode.kind]}
      size="md"
      isPending={pending}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button variant="ghost" isDisabled={pending} onPress={state.close}>
            Cancel
          </Button>
          <Button isDisabled={pending || incomplete} onPress={handleSave}>
            {ACTIONS[mode.kind]}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {mode.kind === "copy" && (
          <p className="text-sm text-muted">
            {`Copies ${mode.list.climbCount} ${mode.list.climbCount === 1 ? "climb" : "climbs"} in circuit order into your lists.`}
          </p>
        )}
        <ClimbListForm draft={draft} onChange={setDraft} error={error} disabled={pending} />
      </div>
    </ResponsiveDialog>
  );
}
