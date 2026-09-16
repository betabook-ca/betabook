"use server";

import { eq } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";

import { getDb } from "@/db/client";
import { getArea, getClimb } from "@/db/queries";
import { climbs } from "@/db/schema";
import { ActionError, toActionResult, type ActionResult } from "@/lib/action-result";
import { validateClimbDescriptionInput, validateNewClimbInput } from "@/lib/climbs";
import { parseId } from "@/lib/parse-id";
import { requireSession } from "@/lib/session";
import { pickFormFields } from "@/lib/validation";

const CLIMB_FORM_FIELDS = ["name", "type", "grade", "description"] as const;
const CLIMB_UPDATE_FORM_FIELDS = ["description"] as const;

export async function updateClimb(climbId: number, formData: FormData): Promise<ActionResult> {
  return toActionResult(async () => {
    await requireSession();
    const db = await getDb();

    const existing = parseId(climbId) === null ? undefined : await getClimb(db, climbId);
    if (!existing) throw new ActionError("Climb not found");

    const input = validateClimbDescriptionInput(pickFormFields(formData, CLIMB_UPDATE_FORM_FIELDS));
    await db.update(climbs).set(input).where(eq(climbs.id, climbId));

    revalidatePath(`/climbs/${climbId}`);
    revalidatePath(`/areas/${existing.areaId}`);
    revalidatePath("/");
    refresh();
  });
}

export async function createClimb(
  areaId: number,
  formData: FormData,
): Promise<ActionResult<number>> {
  return toActionResult(async () => {
    await requireSession();
    const db = await getDb();

    const area = parseId(areaId) === null ? undefined : await getArea(db, areaId);
    if (!area) throw new ActionError("Area not found");

    const input = validateNewClimbInput(pickFormFields(formData, CLIMB_FORM_FIELDS));
    const [{ id }] = await db
      .insert(climbs)
      .values({ areaId, ...input })
      .returning({ id: climbs.id });

    revalidatePath(`/areas/${areaId}`);
    revalidatePath("/");
    refresh();
    return id;
  });
}
