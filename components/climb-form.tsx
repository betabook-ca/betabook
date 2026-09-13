"use client";

import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { useState, useTransition } from "react";

import { createClimb, updateClimb } from "@/actions";
import { AreaPicker, type PickedArea } from "@/components/area-picker";
import { SURFACE_CARD_CLASS } from "@/components/ui/card";
import { choicePillClass } from "@/components/ui/choice-pill";
import { DISCIPLINE_CHIP_CLASSNAME, DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { FieldFeedback } from "@/components/ui/field-support";
import { InlineAlert } from "@/components/ui/inline-alert";
import { OptionSelect } from "@/components/ui/option-select";
import type { Climb } from "@/db/queries";
import { nativeGradeArray, type ClimbType } from "@/lib/grades";

type ClimbFormProps = {
  /** The climb's area, when already known (editing, or creating from a
   * specific area's page). `null` renders an area picker instead, for
   * creating a climb with no area yet in context. */
  areaId: number | null;
  climb?: Climb;
  /** Starting values for a new climb, carried over from a search that failed
   * to find it (see ClimbPicker's empty state) so nothing is retyped. Ignored
   * when `climb` is given — an edit starts from the climb itself. */
  initial?: {
    name?: string;
    type?: ClimbType;
    areaName?: string;
    area?: { id: number; name: string; ancestorPath: string | null };
  };
  onDone?: (climbId: number, climbName?: string) => void;
};

// oxlint-disable-next-line complexity -- create/edit form with many conditionally-rendered fields
export function ClimbForm({ areaId: fixedAreaId, climb, initial, onDone }: ClimbFormProps) {
  const [name, setName] = useState(climb?.name ?? initial?.name ?? "");
  const [type, setType] = useState<ClimbType>(climb?.type ?? initial?.type ?? "boulder");
  const [grade, setGrade] = useState(String(climb?.grade ?? 0));
  const [description, setDescription] = useState(climb?.description ?? "");
  const [pickedArea, setPickedArea] = useState<PickedArea | null>(initial?.area ?? null);
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [pending, startTransition] = useTransition();

  const areaId = fixedAreaId ?? pickedArea?.id ?? null;
  const gradeOptions = nativeGradeArray(type);
  const trimmedName = name.trim();
  const nameInvalid = submitAttempted && !trimmedName;
  const areaInvalid = submitAttempted && !climb && areaId == null;

  function handleTypeChange(next: ClimbType) {
    setType(next);
    setGrade("0");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitAttempted(true);

    if (climb) {
      const formData = new FormData();
      formData.set("description", description);
      startTransition(async () => {
        const result = await updateClimb(climb.id, formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone?.(climb.id, climb.name);
      });
      return;
    }

    const targetAreaId = areaId;
    if (!trimmedName || targetAreaId == null) return;

    const formData = new FormData();
    formData.set("name", trimmedName);
    formData.set("type", type);
    formData.set("grade", grade);
    formData.set("description", description);

    startTransition(async () => {
      const result = await createClimb(targetAreaId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone?.(result.value, trimmedName);
    });
  }

  if (climb) {
    return (
      <form onSubmit={handleSubmit} className={SURFACE_CARD_CLASS}>
        <TextField className="w-full" value={description} onChange={setDescription}>
          <Label>Description</Label>
          <TextArea placeholder="Describe the climb…" rows={6} />
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
      {fixedAreaId == null && (
        <div className="flex flex-col gap-2">
          <AreaPicker
            isRequired
            selected={pickedArea}
            onSelectedChange={setPickedArea}
            isInvalid={areaInvalid}
            validationError={areaInvalid ? "Select an area." : undefined}
            defaultQuery={initial?.areaName}
          />
        </div>
      )}

      <TextField
        className={FIELD_WIDTH_CLASS.long}
        value={name}
        onChange={setName}
        isInvalid={nameInvalid}
        isRequired
        validationBehavior="aria"
      >
        <Label>Name</Label>
        <Input />
        <FieldFeedback error={nameInvalid ? "Name is required." : null} />
      </TextField>

      <fieldset>
        <legend className="mb-2">
          <Label isRequired>Discipline</Label>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(DISCIPLINE_LABELS) as ClimbType[]).map((discipline) => (
            <label
              key={discipline}
              className={`${choicePillClass(type === discipline, DISCIPLINE_CHIP_CLASSNAME[discipline])} has-focus-visible:status-focused`}
            >
              <input
                type="radio"
                name="discipline"
                value={discipline}
                checked={type === discipline}
                onChange={() => handleTypeChange(discipline)}
                required
                className="sr-only"
              />
              {DISCIPLINE_LABELS[discipline]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label isRequired>Grade</Label>
        <OptionSelect
          ariaLabel="Grade"
          isRequired
          className={FIELD_WIDTH_CLASS.short}
          value={grade}
          onChange={setGrade}
          options={gradeOptions.map((label, i) => ({ value: String(i), label }))}
        />
      </div>

      <TextField className="w-full" value={description} onChange={setDescription}>
        <Label>Description</Label>
        <TextArea placeholder="Describe the climb…" rows={6} />
      </TextField>

      {error && <InlineAlert>{error}</InlineAlert>}

      <Button type="submit" isDisabled={pending} className="self-start">
        Add climb
      </Button>
    </form>
  );
}
