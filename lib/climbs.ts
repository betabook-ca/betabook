import type { Climb } from "@/db/queries";
import { ActionError } from "@/lib/action-result";
import { nativeGradeArray, type ClimbType } from "@/lib/grades";
import { parseGradeIndex, requireTrimmed, trimOrNull } from "@/lib/validation";

const CLIMB_TYPES = ["boulder", "sport", "trad"] as const;

export type ClimbInput = {
  name: string;
  type: ClimbType;
  grade: number;
  description: string | null;
};

export type RawClimbInput = {
  name: FormDataEntryValue | null;
  type: FormDataEntryValue | null;
  grade: FormDataEntryValue | null;
  description: FormDataEntryValue | null;
};

export type RawClimbDescriptionInput = {
  description: FormDataEntryValue | null;
};

export function isClimbType(value: unknown): value is ClimbType {
  return typeof value === "string" && (CLIMB_TYPES as readonly string[]).includes(value);
}

export function validateNewClimbInput(raw: RawClimbInput): ClimbInput {
  const name = requireTrimmed(raw.name, "Name");

  if (!isClimbType(raw.type)) {
    throw new ActionError("Invalid discipline");
  }
  const type = raw.type;

  const grade = parseGradeIndex(raw.grade, nativeGradeArray(type).length, "Grade");
  const description = trimOrNull(raw.description);

  return { name, type, grade, description };
}

export function validateClimbDescriptionInput(raw: RawClimbDescriptionInput): {
  description: string | null;
} {
  return { description: trimOrNull(raw.description) };
}

/** Descriptions are edited directly and excluded from moderation. */
export type ClimbEditInput = Omit<ClimbInput, "description">;

export type RawClimbEditInput = Omit<RawClimbInput, "description">;

/** Existing sends store discipline-specific grade ordinals, so their climb
 * cannot change discipline. The database trigger enforces the same invariant. */
export function validateClimbEditInput(existing: Climb, raw: RawClimbEditInput): ClimbEditInput {
  const name = requireTrimmed(raw.name, "Name");
  if (!isClimbType(raw.type)) {
    throw new ActionError("Invalid discipline");
  }
  if (raw.type !== existing.type && existing.sendCount > 0) {
    throw new ActionError("Can't change discipline once a climb has logged sends");
  }
  const grade = parseGradeIndex(raw.grade, nativeGradeArray(raw.type).length, "Grade");
  return { name, type: raw.type, grade };
}

/** Merge targets retain their discipline and area. */
export type ClimbMergeOverrides = Partial<Pick<ClimbInput, "name" | "grade" | "description">>;

function asGradeValue(value: unknown): FormDataEntryValue | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

/** Whitelist and validate stored or client-supplied overrides before building an UPDATE. */
export function validateClimbMergeOverrides(target: Climb, raw: unknown): ClimbMergeOverrides {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ActionError("Invalid merge overrides");
  }
  const fields = raw as Record<string, unknown>;
  const overrides: ClimbMergeOverrides = {};
  if (fields.name !== undefined) {
    overrides.name = requireTrimmed(typeof fields.name === "string" ? fields.name : null, "Name");
  }
  if (fields.grade !== undefined) {
    overrides.grade = parseGradeIndex(
      asGradeValue(fields.grade),
      nativeGradeArray(target.type).length,
      "Grade",
    );
  }
  if (fields.description !== undefined) {
    overrides.description = trimOrNull(
      typeof fields.description === "string" ? fields.description : null,
    );
  }
  return overrides;
}
