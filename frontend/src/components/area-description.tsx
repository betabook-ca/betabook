"use client";

import { Button, useOverlayState } from "@heroui/react";
import { Pencil } from "lucide-react";

import { AreaFormDrawer } from "@/components/area-form-drawer";
import type { Area } from "@/db/queries";

/** An area's description with the pencil that edits it. */
export function AreaDescription({ area }: { area: Area }) {
  const editState = useOverlayState();

  return (
    <>
      <p className="mt-1 flex items-start gap-1.5 text-muted">
        <span className={`min-w-0 ${area.description ? "" : "italic"}`}>
          {area.description || "No description yet."}
        </span>
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label={area.description ? "Edit area" : "Add a description"}
          onPress={editState.open}
          // Matches the text's line box so the button doesn't grow the line.
          className="size-6 shrink-0"
        >
          <Pencil className="size-3.5" />
        </Button>
      </p>
      <AreaFormDrawer area={area} state={editState} />
    </>
  );
}
