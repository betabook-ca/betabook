"use client";

import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useState, useTransition } from "react";

import { createArea, updateArea } from "@/actions";
import { AreaPicker, type PickedArea } from "@/components/area-picker";
import { SURFACE_CARD_CLASS } from "@/components/ui/card";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import type { Area } from "@/db/queries";

type AreaFormProps = {
  /** The new area's parent, when already fixed (creating a subarea from an
   * existing area's menu — no picker shown). `null` renders an `AreaPicker`
   * instead, which the viewer has to pick from: every area added here goes
   * under an existing one. Root areas exist (the seed data's continents) but
   * aren't creatable from this form, so an empty picker is an error rather
   * than a request for one. Ignored when editing (`area` present) — an
   * area's parent isn't editable here. */
  parentId: number | null;
  area?: Area;
  onDone?: (areaId: number, areaName?: string) => void;
};

export function AreaForm({ parentId: fixedParentId, area, onDone }: AreaFormProps) {
  const [name, setName] = useState(area?.name ?? "");
  const [description, setDescription] = useState(area?.description ?? "");
  const [pickedParent, setPickedParent] = useState<PickedArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [pending, startTransition] = useTransition();

  const parentId = fixedParentId ?? pickedParent?.id ?? null;
  const trimmedName = name.trim();
  const parentInvalid = submitAttempted && parentId == null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitAttempted(true);

    if (area) {
      const formData = new FormData();
      formData.set("description", description);
      startTransition(async () => {
        const result = await updateArea(area.id, formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone?.(area.id, area.name);
      });
      return;
    }

    // A new area always goes under an existing one; `parentInvalid` is
    // already showing why nothing happened.
    if (parentId == null) return;

    const formData = new FormData();
    formData.set("name", trimmedName);
    formData.set("description", description);

    startTransition(async () => {
      const result = await createArea(parentId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone?.(result.value, trimmedName);
    });
  }

  if (area) {
    return (
      <form onSubmit={handleSubmit} className={SURFACE_CARD_CLASS}>
        <TextField className="w-full" value={description} onChange={setDescription}>
          <Label>Description</Label>
          <TextArea placeholder="Describe the area…" rows={6} />
        </TextField>

        {error && <InlineAlert>{error}</InlineAlert>}

        <Button type="submit" isDisabled={pending} className="self-start">
          Save changes
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={SURFACE_CARD_CLASS}>
      {fixedParentId == null && (
        <div className="flex flex-col gap-2">
          <AreaPicker
            isRequired
            label="Parent area"
            selected={pickedParent}
            onSelectedChange={setPickedParent}
            isInvalid={parentInvalid}
            validationError={parentInvalid ? "Select a parent area." : undefined}
          />
        </div>
      )}

      <TextField className={FIELD_WIDTH_CLASS.long} value={name} onChange={setName} isRequired>
        <Label>Name</Label>
        <Input />
      </TextField>

      <TextField className="w-full" value={description} onChange={setDescription}>
        <Label>Description</Label>
        <TextArea placeholder="Describe the area…" rows={6} />
      </TextField>

      {error && <InlineAlert>{error}</InlineAlert>}

      <Button type="submit" isDisabled={pending || !trimmedName} className="self-start">
        Add area
      </Button>
    </form>
  );
}
