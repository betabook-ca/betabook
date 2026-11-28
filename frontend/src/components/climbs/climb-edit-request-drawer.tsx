"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { useState } from "react";

import { useGradePreferences } from "@/components/climbing/grade-preferences";
import { DisciplinePicker } from "@/components/climbs/discipline-picker";
import { ReviewQueuedNotice, useReviewRequest } from "@/components/climbs/review-request";
import { InlineAlert } from "@/components/ui/inline-alert";
import { OptionSelect } from "@/components/ui/option-select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { Climb } from "@/lib/catalog-types";
import { gradeOptionValue, gradeOptions, type ClimbType } from "@/lib/grades";
import { requestClimbEdit } from "@/spa/lib/actions-client";

type ClimbEditRequestDrawerProps = {
  climb: Climb;
  state: UseOverlayStateReturn;
};

/** A full edit (name/discipline/grade) — gated behind admin approval. The description isn't here:
 * updateClimb (the description pencil) already lets any signed-in user edit
 * it instantly. */
export function ClimbEditRequestDrawer({ climb, state }: ClimbEditRequestDrawerProps) {
  const disciplineLocked = climb.sendCount > 0;
  const originalGrade = String(climb.grade ?? 0);

  const [name, setName] = useState(climb.name);
  const [type, setType] = useState<ClimbType>(climb.type);
  const [grade, setGrade] = useState(originalGrade);
  const request = useReviewRequest({
    queuedNotice: "Submitted for admin review — this won't take effect until it's approved.",
    onApplied: state.close,
  });

  const prefs = useGradePreferences();
  const trimmedName = name.trim();

  function handleTypeChange(next: ClimbType) {
    setType(next);
    setGrade(next === climb.type ? originalGrade : "0");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmedName) return;
    const formData = new FormData();
    formData.set("name", trimmedName);
    formData.set("type", type);
    formData.set("grade", grade);
    request.submit(() => requestClimbEdit(climb.id, formData));
  }

  function reset() {
    setName(climb.name);
    setType(climb.type);
    setGrade(originalGrade);
    request.reset();
  }

  return (
    <ResponsiveDialog
      state={state}
      title="Request a full edit"
      isPending={request.pending}
      onClose={reset}
    >
      {request.notice ? (
        // Swap the whole form out once the request is queued — leaving
        // it enabled invites a second click and a duplicate request.
        <ReviewQueuedNotice notice={request.notice} onDone={state.close} />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextField value={name} onChange={setName} isRequired>
            <Label>Name</Label>
            <Input />
          </TextField>

          <DisciplinePicker
            value={type}
            onChange={handleTypeChange}
            isDisabled={disciplineLocked}
            description={
              disciplineLocked
                ? "Discipline can’t be changed once sends have been logged."
                : undefined
            }
          />

          <div className="flex flex-col gap-2">
            <Label>Grade</Label>
            <OptionSelect
              ariaLabel="Grade"
              value={gradeOptionValue(type, Number(grade), prefs)}
              onChange={setGrade}
              options={gradeOptions(type, prefs)}
            />
          </div>

          {request.error && <InlineAlert>{request.error}</InlineAlert>}

          <Button type="submit" isDisabled={request.pending || !trimmedName} fullWidth>
            Save changes
          </Button>
        </form>
      )}
    </ResponsiveDialog>
  );
}
