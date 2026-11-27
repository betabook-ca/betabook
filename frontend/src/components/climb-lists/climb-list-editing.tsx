"use client";

import { Button } from "@heroui/react";
import { Pencil } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ListEditor = { start: () => void };

type EditingActions = {
  /** The list registers how to open its editor, or null once it unmounts. */
  setEditor: (editor: ListEditor | null) => void;
  setEditing: (editing: boolean) => void;
};
type EditingState = { editing: boolean; startEdit: (() => void) | null };

const ActionsContext = createContext<EditingActions | null>(null);
const StateContext = createContext<EditingState>({ editing: false, startEdit: null });

/** Joins the list header's Edit climbs button to the list below it. The list owns
 * its editor (and what opening it means for a sorted or filtered view); the
 * header only asks it to open, and greys out while it is open. */
export function ClimbListEditingProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [editor, setEditor] = useState<ListEditor | null>(null);
  return (
    <ActionsContext.Provider value={{ setEditor, setEditing }}>
      <StateContext.Provider value={{ editing, startEdit: editor?.start ?? null }}>
        {children}
      </StateContext.Provider>
    </ActionsContext.Provider>
  );
}

/** Called by the list: registers its Edit action (null when the reader can't
 * edit, which leaves the header's Edit climbs disabled) and reports whether its
 * editor is open. Without a provider (a shared-link page) it does nothing. */
export function useClimbListEditControl(editing: boolean, startEdit: (() => void) | null) {
  const actions = useContext(ActionsContext);
  const setEditor = actions?.setEditor;
  const setEditing = actions?.setEditing;
  const latest = useRef(startEdit);
  useEffect(() => {
    latest.current = startEdit;
  });
  const canStart = startEdit !== null;
  useEffect(() => {
    if (!setEditor || !canStart) return;
    setEditor({ start: () => latest.current?.() });
    return () => {
      setEditor(null);
      setEditing?.(false);
    };
  }, [setEditor, setEditing, canStart]);
  useEffect(() => {
    setEditing?.(editing);
  }, [setEditing, editing]);
}

/** The owner's Edit climbs, in the list header. Adding, removing and reordering
 * climbs all happen in the editor, so this is the one way in. */
export function ClimbListEditButton({ variant }: { variant?: "outline" }) {
  const { editing, startEdit } = useContext(StateContext);
  return (
    <Button variant={variant} isDisabled={editing || !startEdit} onPress={() => startEdit?.()}>
      <Pencil className="size-4" aria-hidden />
      Edit climbs
    </Button>
  );
}
