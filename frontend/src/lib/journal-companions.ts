import type { components } from "@/spa/generated/api";

export const MAX_JOURNAL_COMPANIONS = 10;
export type JournalCompanion = components["schemas"]["JournalCompanion"];
export type CompanionOption = Pick<JournalCompanion, "id" | "name" | "image">;
