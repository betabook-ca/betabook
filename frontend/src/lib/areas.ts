import { requireTrimmed, trimOrNull } from "@/lib/validation";

export type AreaInput = {
  name: string;
  description: string | null;
};

export type RawAreaInput = {
  name: FormDataEntryValue | null;
  description: FormDataEntryValue | null;
};

export type RawAreaDescriptionInput = {
  description: FormDataEntryValue | null;
};

export function validateAreaInput(raw: RawAreaInput): AreaInput {
  const name = requireTrimmed(raw.name, "Name");
  const description = trimOrNull(raw.description);

  return { name, description };
}

/** Name is immutable after creation — editing an area only ever touches its
 * description. */
export function validateAreaDescriptionInput(raw: RawAreaDescriptionInput): {
  description: string | null;
} {
  return { description: trimOrNull(raw.description) };
}
