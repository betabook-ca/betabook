"use server";

import { eq } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { getArea } from "@/db/queries";
import { areas } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { validateAreaDescriptionInput, validateAreaInput, type RawAreaInput } from "@/lib/areas";
import { parseId } from "@/lib/parse-id";
import { requireSession } from "@/lib/session";
import { pickFormFields } from "@/lib/validation";

import { afterCommit } from "./post-commit";

const AREA_FORM_FIELDS = ["name", "description"] as const;
const AREA_UPDATE_FORM_FIELDS = ["description"] as const;

function readAreaFormData(formData: FormData): RawAreaInput {
  return pickFormFields(formData, AREA_FORM_FIELDS);
}

export async function updateArea(areaId: number, formData: FormData): Promise<ActionResult> {
  return toActionResult(async () => {
    await requireSession();
    const db = await getDb();

    const existing = parseId(areaId) === null ? undefined : await getArea(db, areaId);
    if (!existing) throw new ActionError("Area not found");

    const input = validateAreaDescriptionInput(pickFormFields(formData, AREA_UPDATE_FORM_FIELDS));
    await db.update(areas).set(input).where(eq(areas.id, areaId));

    afterCommit(() => {
      revalidatePath(`/areas/${areaId}`);
      if (existing.parentId != null) revalidatePath(`/areas/${existing.parentId}`);
      revalidatePath("/");
      refresh();
    });
  });
}

/** A plain one-row insert: `parentId` is the tree, so the area is fully
 * placed the moment it commits — correct on its own page, in its parent's
 * sub-area list, and in every ancestor's subtree climb listing, with no
 * background repair to wait on and no window where those reads disagree.
 *
 * Every area created here is placed under an existing one. Root areas exist
 * — the seed data's continents — but aren't creatable: an area with no
 * parent is unreachable by walking down from a continent, so it would only
 * ever be found by search. The type says as much, but this is a server
 * action and so a callable endpoint, hence the runtime check too. */
export async function createArea(
  parentId: number,
  formData: FormData,
): Promise<ActionResult<number>> {
  return toActionResult(async () => {
    await requireSession();
    const db = await getDb();

    const parent = parseId(parentId) === null ? undefined : await getArea(db, parentId);
    if (!parent) throw new ActionError("Parent area not found");

    const input = validateAreaInput(readAreaFormData(formData));

    // areas_fts stays in sync via triggers (drizzle/migrations/
    // 0015_fts_sync_triggers.sql), atomically within this same statement.
    const [{ id }] = await db
      .insert(areas)
      .values({ parentId, ...input })
      .returning({ id: areas.id });

    afterCommit(() => {
      revalidatePath(`/areas/${parentId}`);
      revalidatePath("/");
      refresh();
    });
    return id;
  });
}
