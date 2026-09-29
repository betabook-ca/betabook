"use client";

import { Button, Label, TextArea, TextField } from "@heroui/react";
import { Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";

import { saveTripNotes } from "@/actions";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldFeedback, FieldHeader } from "@/components/ui/field-support";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/ui/typography";
import { MAX_TRIP_NOTES } from "@/lib/trips";

// Loaded when a preview is asked for: reading the notes renders them on the
// server, so only a climber checking a draft downloads the parser.
const MarkdownPreview = dynamic(
  () => import("@/components/ui/markdown").then((module) => module.Markdown),
  { ssr: false, loading: () => <Skeleton className="h-24 w-full" /> },
);

export function TripNotes({
  tripId,
  notes,
  children,
}: {
  tripId: number;
  /** The source as stored, which is what the editor opens on. */
  notes: string | null;
  /** The same notes rendered on the server. */
  children: ReactNode;
}) {
  const router = useRouter();
  const previewId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEditing() {
    setDraft(notes ?? "");
    setPreviewing(false);
    setError(null);
    setEditing(true);
  }

  function handleSave() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await saveTripNotes(tripId, draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <section aria-label="Trip notes" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHeading>Trip notes</SectionHeading>
          {notes && (
            <Button variant="ghost" size="sm" onPress={startEditing}>
              <Pencil className="size-4" />
              Edit
            </Button>
          )}
        </div>
        {notes ? (
          <div className={cardClass("fluid", "bordered")}>{children}</div>
        ) : (
          <EmptyState
            message="No trip notes yet. Write up how it went: the highlights, the logistics, a link to your photos."
            cta={
              <Button onPress={startEditing}>
                <Pencil className="size-4" />
                Write trip notes
              </Button>
            }
          />
        )}
      </section>
    );
  }

  const hasDraft = draft.trim().length > 0;

  return (
    <section aria-label="Trip notes" className="flex min-w-0 flex-col gap-3">
      <TextField className="w-full" value={draft} onChange={setDraft} maxLength={MAX_TRIP_NOTES}>
        <FieldHeader usage={{ used: draft.length, limit: MAX_TRIP_NOTES, unit: "characters" }}>
          <Label>Trip notes</Label>
        </FieldHeader>
        <TextArea rows={14} placeholder="Day one: warmed up at the Happies…" />
        <FieldFeedback helper="Format with **bold**, *italic*, # headings and - lists. Links you paste become clickable." />
      </TextField>

      {previewing && (
        <section
          id={previewId}
          aria-label="Trip notes preview"
          className={cardClass("fluid", "bordered")}
        >
          {hasDraft ? (
            <MarkdownPreview>{draft}</MarkdownPreview>
          ) : (
            <p className="text-sm text-muted">Nothing to preview yet.</p>
          )}
        </section>
      )}

      {error && <InlineAlert>{error}</InlineAlert>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          aria-expanded={previewing}
          aria-controls={previewing ? previewId : undefined}
          onPress={() => setPreviewing((wasPreviewing) => !wasPreviewing)}
        >
          {previewing ? "Hide preview" : "Preview"}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" isDisabled={pending} onPress={() => setEditing(false)}>
            Cancel
          </Button>
          <Button isDisabled={pending} onPress={handleSave}>
            Save notes
          </Button>
        </div>
      </div>
    </section>
  );
}
