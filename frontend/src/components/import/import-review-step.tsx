"use client";

import { Button } from "@heroui/react";

import { InlineAlert } from "@/components/ui/inline-alert";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { formatCount } from "@/lib/format";
import type { ImportProgress } from "@/lib/import-execution";
import type { ResolvedSummary } from "@/lib/import-matching";
import type { CoercionWarning, InvalidImportRow } from "@/lib/sends-import";

import type { Filter } from "./import-match-step";
import { TEXT_BUTTON_CLASS } from "./text-button";
import { Stat } from "./value-mapping-section";

export type ConflictMode = "skip" | "overwrite";

const CONFLICT_MODES = [
  { value: "skip", label: "Skip" },
  { value: "overwrite", label: "Overwrite" },
] as const;

/** Step 5: the counts that will import, what to do with already-logged
 * climbs, and the running import's progress once it starts. */
export function ImportReviewStep({
  summary,
  invalid,
  warnings,
  pending,
  progress,
  onConflict,
  onConflictChange,
  cancelRequested,
  onCancel,
  onShowMatches,
  onBack,
  onImport,
}: {
  summary: ResolvedSummary;
  invalid: readonly InvalidImportRow[];
  warnings: readonly CoercionWarning[];
  pending: boolean;
  progress: ImportProgress | null;
  onConflict: ConflictMode;
  onConflictChange: (mode: ConflictMode) => void;
  cancelRequested: boolean;
  onCancel: () => void;
  /** Back to matching, filtered to the rows a note is about. */
  onShowMatches: (filter: Filter) => void;
  onBack: () => void;
  onImport: () => void;
}) {
  const backToMatching = (filter: Filter, label: string) => (
    <button
      type="button"
      disabled={pending}
      onClick={() => onShowMatches(filter)}
      className={TEXT_BUTTON_CLASS}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Will import" value={summary.ready} />
        <Stat
          label="Unmatched"
          value={summary.attention}
          tone={summary.attention > 0 ? "warning" : undefined}
        />
        <Stat label="Skipped" value={summary.skipped} />
        {/* Rows rejected outright, whether by normalization or by a climb
         * that broke before the ascent's date. Neither can be resolved by
         * picking a different climb. */}
        <Stat
          label="Can't import"
          value={invalid.length + summary.broken}
          tone={invalid.length + summary.broken > 0 ? "danger" : undefined}
        />
      </div>

      {summary.broken > 0 && (
        <p className="text-sm text-muted">
          {formatCount(summary.broken, "row")}{" "}
          {summary.broken === 1 ? "names a climb" : "name climbs"} that broke before the
          ascent&rsquo;s date, so {summary.broken === 1 ? "it" : "they"} can&rsquo;t be imported.{" "}
          {backToMatching("broken", "Back to matching")}
        </p>
      )}

      {summary.attention > 0 && (
        <p className="text-sm text-muted">
          {formatCount(summary.attention, "row")} {summary.attention === 1 ? "has" : "have"} no
          matching climb and will be skipped. {backToMatching("attention", "Back to matching")}
        </p>
      )}

      {summary.review > 0 && (
        <p className="text-sm text-muted">
          {formatCount(summary.review, "row")} {summary.review === 1 ? "was" : "were"} matched by
          inference from the file&apos;s hints and grades, not by name alone.{" "}
          {backToMatching("review", "Check them")}
        </p>
      )}

      {invalid.length > 0 && (
        <details>
          <summary className={`${TEXT_BUTTON_CLASS} text-sm text-muted`}>
            View rows that can&apos;t be imported
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
            {invalid.map((row) => (
              <li key={row.rowIndex}>
                Row {row.rowIndex + 1}: {row.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm">Some values will be adjusted during import:</p>
          <InlineAlert status="warning">
            <ul className="flex flex-col gap-1">
              {warnings.map((warning) => (
                <li key={warning.field}>
                  {warning.count} {warning.count === 1 ? "row" : "rows"}: {warning.message} (
                  {warning.examples.join("; ")}
                  {warning.count > warning.examples.length ? "; …" : ""})
                </li>
              ))}
            </ul>
          </InlineAlert>
        </div>
      )}

      {pending && progress ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">
            Importing… {progress.completed} / {progress.total} rows processed
          </p>
          <ProgressBar value={progress.completed} max={progress.total} label="Importing sends" />
          <p className="text-xs text-muted">
            {progress.imported} imported &middot;{" "}
            {onConflict === "overwrite" && <>{progress.overwritten} overwritten &middot; </>}
            {progress.alreadyLogged} already logged &middot; {progress.failed} failed
          </p>
          {progress.lastError && (
            <InlineAlert>
              {progress.failed} {progress.failed === 1 ? "row has" : "rows have"} failed so far.
              Latest error: {progress.lastError}
            </InlineAlert>
          )}
          <div>
            <Button variant="ghost" onPress={onCancel} isDisabled={cancelRequested}>
              {cancelRequested ? "Stopping after the current batch…" : "Cancel import"}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Already-logged climbs</legend>
            <SegmentedButtons
              value={onConflict}
              onChange={onConflictChange}
              options={CONFLICT_MODES}
              className="lg:w-auto lg:self-start"
            />
          </fieldset>
          {onConflict === "overwrite" ? (
            <InlineAlert status="warning">
              Imported values will replace your existing send data for any already-logged climbs.
              This cannot be undone.
            </InlineAlert>
          ) : (
            <p className="text-sm text-muted">
              Climbs you&apos;ve already logged are left untouched and counted as already logged.
            </p>
          )}

          <div className="flex gap-4">
            <Button variant="ghost" onPress={onBack}>
              Back
            </Button>
            <Button onPress={onImport} isDisabled={summary.ready === 0}>
              Import {formatCount(summary.ready, "send")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
