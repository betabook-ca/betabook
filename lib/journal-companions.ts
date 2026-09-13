import { ActionError } from "@/lib/action-result";

export const MAX_JOURNAL_COMPANIONS = 10;
export type JournalCompanion = { id: string; name: string; isSelf: boolean };
export type CompanionOption = Pick<JournalCompanion, "id" | "name">;

/** Omitted controls preserve hidden selections on ordinary edits. */
export function readCompanionSelection(form: FormData): string[] | undefined {
  const raw = form.getAll("companion");
  if (!form.has("companionsChanged") && raw.length === 0) return undefined;
  if (raw.length > 100) throw new ActionError("Choose at most 10 friends");
  const ids = new Set<string>();
  for (const id of raw) {
    if (typeof id !== "string" || !id.trim() || id.length > 128)
      throw new ActionError("Invalid friend selection");
    ids.add(id);
  }
  if (ids.size > MAX_JOURNAL_COMPANIONS) throw new ActionError("Choose at most 10 friends");
  return [...ids];
}
