"use client";

import { Button, Label, TextArea, TextField, useOverlayState } from "@heroui/react";
import { clsx } from "clsx";
import { Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { saveTripNotes } from "@/actions";
import { cardClass } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldFeedback, FieldHeader } from "@/components/ui/field-support";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeading } from "@/components/ui/typography";
import { MAX_TRIP_NOTES } from "@/lib/trips";

// Loaded when a preview is asked for: reading the notes renders them on the
// server, so only a climber checking a draft downloads the parser.
const MarkdownPreview = dynamic(
  () => import("@/components/ui/markdown").then((module) => module.Markdown),
  { ssr: false, loading: () => <Skeleton className="h-24 w-full" /> },
);

/** The journal's reading measure, at the size the notes are set in. */
const MEASURE_CLASS = "max-w-[65ch] text-sm";

export function TripNotes({
  tripId,
  notes,
  canEdit,
  children,
}: {
  tripId: number;
  /** The source as stored, which is what the editor opens on. */
  notes: string | null;
  canEdit: boolean;
  /** The same notes rendered on the server. */
  children: ReactNode;
}) {
  const router = useRouter();
  const editor = useOverlayState();
  const [draft, setDraft] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startEditing() {
    setDraft(notes ?? "");
    setPreviewing(false);
    setError(null);
    editor.open();
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
      editor.close();
      router.refresh();
    });
  }

  return (
    <section aria-label="Trip notes" className="flex min-w-0 flex-col gap-3">
      <SectionHeading>Trip notes</SectionHeading>
      {notes ? (
        <div className={`flow-root ${cardClass("fluid", "bordered")}`}>
          {canEdit && (
            <Button
              isIconOnly
              variant="ghost"
              size="sm"
              aria-label="Edit trip notes"
              onPress={startEditing}
              // Floated into the card's corner: the notes start on its first
              // line, and only the lines beside the button run short.
              className="float-right -mt-2 -mr-2 mb-1 ml-2 sm:-mt-3 sm:-mr-3"
            >
              <Pencil className="size-4" />
            </Button>
          )}
          <div className={MEASURE_CLASS}>{children}</div>
        </div>
      ) : (
        <EmptyState
          message="No trip notes yet."
          cta={
            canEdit ? (
              <Button onPress={startEditing}>
                <Pencil className="size-4" />
                Write trip notes
              </Button>
            ) : undefined
          }
        />
      )}

      {canEdit && (
        <ResponsiveDialog
          state={editor}
          title="Edit trip notes"
          size="lg"
          presentation="fullscreen"
          isPending={pending}
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <Button
                variant="ghost"
                isDisabled={pending}
                onPress={() => setPreviewing((wasPreviewing) => !wasPreviewing)}
              >
                {previewing ? "Keep writing" : "Preview"}
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" isDisabled={pending} onPress={editor.close}>
                  Cancel
                </Button>
                <Button isDisabled={pending} onPress={handleSave}>
                  Save notes
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            {/* The preview lies over the field instead of replacing it, so the
             * dialog keeps its height and the toggle stays under the pointer. */}
            <div className="relative">
              <div
                aria-hidden={previewing || undefined}
                className={clsx(previewing && "invisible")}
              >
                <TextField
                  className="w-full"
                  value={draft}
                  onChange={setDraft}
                  maxLength={MAX_TRIP_NOTES}
                  isDisabled={pending}
                >
                  <FieldHeader
                    usage={{ used: draft.length, limit: MAX_TRIP_NOTES, unit: "characters" }}
                  >
                    <Label>Trip notes</Label>
                  </FieldHeader>
                  <TextArea
                    rows={14}
                    placeholder="Plans, conditions, what went, what to come back for…"
                  />
                  <FieldFeedback helper="Format with **bold**, *italic*, # headings and - lists. Links you paste become clickable." />
                </TextField>
              </div>
              {/* The scroll region needs a tab stop so keyboard users can scroll the preview. */}
              {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex */}
              {previewing && (
                <div
                  role="region"
                  aria-label="Trip notes preview"
                  tabIndex={0}
                  // The dialog body mutes its text; the page the notes land on does not.
                  className={`absolute inset-0 overflow-y-auto text-foreground focus-visible:status-focused ${cardClass("fluid", "bordered")}`}
                >
                  <div className={MEASURE_CLASS}>
                    {draft.trim() ? (
                      <MarkdownPreview>{draft}</MarkdownPreview>
                    ) : (
                      <p className="text-muted">Nothing to preview yet.</p>
                    )}
                  </div>
                </div>
              )}
              {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
            </div>
            {error && <InlineAlert>{error}</InlineAlert>}
          </div>
        </ResponsiveDialog>
      )}
    </section>
  );
}
