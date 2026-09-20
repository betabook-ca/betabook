"use client";

import { Button, Input, Label, ListBox, Select, TextField } from "@heroui/react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { useId, useState, useTransition } from "react";

import { requestClimbEdit } from "@/actions";
import { FIELD_CLASS } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import type { Climb } from "@/db/queries";
import { nativeGradeArray, type ClimbType } from "@/lib/grades";

type ClimbEditRequestDrawerProps = {
  climb: Climb;
  state: UseOverlayStateReturn;
};

const CLIMB_TYPE_LABELS: Record<ClimbType, string> = {
  boulder: "Boulder",
  sport: "Sport",
  trad: "Trad",
};
const UNKNOWN_GRADE = "unknown";

/** A full edit (name/discipline/grade) — gated behind admin approval (see
 * actions/moderation.ts's requestClimbEdit). The description isn't here:
 * updateClimb (the description pencil) already lets any signed-in user edit
 * it instantly. */
export function ClimbEditRequestDrawer({ climb, state }: ClimbEditRequestDrawerProps) {
  const disciplineLocked = climb.sendCount > 0;
  const disciplineId = useId();
  const originalGrade = climb.grade === null ? UNKNOWN_GRADE : String(climb.grade);

  const [name, setName] = useState(climb.name);
  const [type, setType] = useState<ClimbType>(climb.type);
  const [grade, setGrade] = useState(originalGrade);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const gradeOptions = nativeGradeArray(type);
  const trimmedName = name.trim();

  function handleTypeChange(next: ClimbType) {
    setType(next);
    setGrade(next === climb.type ? originalGrade : "0");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPendingNotice(null);
    if (!trimmedName) return;

    const formData = new FormData();
    formData.set("name", trimmedName);
    formData.set("type", type);
    formData.set("grade", grade === UNKNOWN_GRADE ? "" : grade);

    startTransition(async () => {
      const result = await requestClimbEdit(climb.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.value.status === "pending") {
        setPendingNotice(
          "Submitted for admin review — this won't take effect until it's approved.",
        );
        return;
      }
      state.close();
    });
  }

  function reset() {
    setName(climb.name);
    setType(climb.type);
    setGrade(originalGrade);
    setError(null);
    setPendingNotice(null);
  }

  return (
    <ResponsiveDialog state={state} title="Request a full edit" isPending={pending} onClose={reset}>
      {pendingNotice ? (
        // Swap the whole form out once the request is queued — leaving
        // it enabled invites a second click and a duplicate request.
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">{pendingNotice}</p>
          <Button variant="ghost" onPress={state.close} fullWidth>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextField value={name} onChange={setName} isRequired>
            <Label>Name</Label>
            <Input />
          </TextField>

          <TextField>
            <Label htmlFor={disciplineId}>Discipline</Label>
            <select
              id={disciplineId}
              value={type}
              disabled={disciplineLocked}
              onChange={(e) => handleTypeChange(e.target.value as ClimbType)}
              className={FIELD_CLASS}
            >
              {Object.entries(CLIMB_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {disciplineLocked && (
              <p className="mt-1 text-xs text-muted">
                Discipline can&rsquo;t be changed once sends have been logged.
              </p>
            )}
          </TextField>

          <TextField>
            <Label>Grade</Label>
            <Select
              aria-label="Grade"
              fullWidth
              selectedKey={grade}
              onSelectionChange={(key) => setGrade(String(key))}
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox className="max-h-64 overflow-y-auto">
                  {climb.grade === null && type === climb.type && (
                    <ListBox.Item id={UNKNOWN_GRADE}>Unknown</ListBox.Item>
                  )}
                  {gradeOptions.map((label, i) => (
                    // oxlint-disable-next-line react/no-array-index-key -- grade index is stable option id
                    <ListBox.Item key={i} id={String(i)}>
                      {label}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </TextField>

          {error && <InlineAlert>{error}</InlineAlert>}

          <Button type="submit" isDisabled={pending || !trimmedName} fullWidth>
            Save changes
          </Button>
        </form>
      )}
    </ResponsiveDialog>
  );
}
