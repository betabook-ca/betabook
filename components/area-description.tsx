"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Pencil } from "lucide-react";

import { AreaFormDrawer } from "@/components/area-form-drawer";
import type { Area } from "@/db/queries";

/** An area's description, with the pencil that edits it sitting right next to
 * it — the affordance is where the thing it changes is, rather than a sentence
 * telling you to go find a menu. Opens the same area form as everywhere else,
 * so a rename is reachable from here too. */
export function AreaDescription({ area }: { area: Area }) {
  const editState = useOverlayState();

  return (
    <>
      {/* items-start so the pencil sits on the description's first line rather
       * than floating beside the middle of a long one; min-w-0 so the text
       * wraps instead of widening the row. */}
      <p className="mt-1 flex items-start gap-1.5 text-muted">
        {/* italic for the placeholder, so an area with no description reads as
         * missing one rather than as having "No description yet." written in
         * it. */}
        <span className={`min-w-0 ${area.description ? "" : "italic"}`}>
          {area.description || "No description yet."}
        </span>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={area.description ? "Edit area" : "Add a description"}
          onPress={editState.open}
          // Sized to the text's own line box (size-6 = 24px): at the button's
          // natural 36px it inflated the description line by half again and
          // sat below the words it belongs to.
          className="size-6 shrink-0"
        >
          <Pencil className="size-3.5" />
        </Button>
      </p>
      <AreaFormDrawer area={area} state={editState} />
    </>
  );
}
