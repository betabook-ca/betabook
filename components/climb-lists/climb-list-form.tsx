"use client";

import { Input, Label, TextArea, TextField } from "@heroui/react";

import { FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { FieldHeader } from "@/components/ui/field-support";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { InlineAlert } from "@/components/ui/inline-alert";
import { MAX_CLIMB_LIST_DESCRIPTION, MAX_CLIMB_LIST_TITLE } from "@/lib/climb-lists";

export type ClimbListDraft = { title: string; description: string };

/** A list's name and description, with no submit button of its own: the
 * dialog around it owns the footer. */
export function ClimbListForm({
  draft,
  onChange,
  error,
  disabled = false,
}: {
  draft: ClimbListDraft;
  onChange: (draft: ClimbListDraft) => void;
  /** The server's message, shown verbatim. */
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TextField
        className={FIELD_WIDTH_CLASS.long}
        value={draft.title}
        onChange={(title) => onChange({ ...draft, title })}
        maxLength={MAX_CLIMB_LIST_TITLE}
        isDisabled={disabled}
        isRequired
      >
        <Label>Name</Label>
        <Input placeholder="Red River classics" />
      </TextField>

      <TextField
        className="w-full"
        value={draft.description}
        onChange={(description) => onChange({ ...draft, description })}
        maxLength={MAX_CLIMB_LIST_DESCRIPTION}
        isDisabled={disabled}
      >
        <FieldHeader
          usage={{
            used: draft.description.length,
            limit: MAX_CLIMB_LIST_DESCRIPTION,
            unit: "characters",
          }}
        >
          <Label>Description</Label>
          <HelpTooltip label="About the description">
            Anyone who can see your lists can see this, including people with this list&apos;s link.
          </HelpTooltip>
        </FieldHeader>
        <TextArea rows={3} placeholder="Moderates worth the drive" />
      </TextField>

      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
