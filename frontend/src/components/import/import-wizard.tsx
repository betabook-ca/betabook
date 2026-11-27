"use client";

import { Button } from "@heroui/react";
import { useEffect, useRef, useState, useTransition } from "react";

import { cardClass } from "@/components/ui/card";
import { useGradePreferences } from "@/components/ui/grade-preferences";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageTitle } from "@/components/ui/typography";
import type { ClimbCandidate } from "@/db/queries";
import { useViewGuard } from "@/hooks/use-view-guard";
import { downloadCsv } from "@/lib/download";
import type { ImportGradePreference } from "@/lib/grades";
import { findImportDateClusters } from "@/lib/import-date-review";
import { runImportBatches, type ImportProgress } from "@/lib/import-execution";
import {
  areaLookupsNeeded,
  distinctClimbNames,
  matchRows,
  buildLooseIndex,
  looseLookupNames,
  looseLookupsNeeded,
  mergeCandidates,
  resolveRows,
  brokenClimbImportReason,
  summarizeResolved,
  type CandidateIndex,
  type ManualChoice,
  type MatchOptions,
  type PreferredArea,
  type ResolvedRow,
} from "@/lib/import-matching";
import { RESOLVE_BATCH_SIZE, type ImportSendRow } from "@/lib/sends";
import {
  buildFailedRowsCsv,
  deriveSourceColumns,
  detectDateFormat,
  detectGradeScale,
  detectImportSource,
  distinctValues,
  findPlaceholderTimestamps,
  guessAscentStyleMapping,
  guessClimbTypeMapping,
  guessColumnMapping,
  guessGradeFeelMapping,
  guessRatingMapping,
  missingRequiredColumns,
  normalizeImportRows,
  parseCsvText,
  DATE_SAMPLE_SIZE,
  IMPORT_SOURCE_LABELS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  type ColumnMapping,
  type FailedImportRow,
  type ImportSource,
  type InvalidImportRow,
  type NormalizedImportRow,
  type ParsedCsv,
  preferredImportGradeScale,
} from "@/lib/sends-import";
import {
  importSends,
  resolveImportClimbs,
  resolveImportClimbsInAreas,
  type ImportResult,
} from "@/spa/lib/actions-client";

import { CsvWarnings } from "./csv-warnings";
import { ImportColumnsStep, columnLabel } from "./import-columns-step";
import { ImportDateWarning } from "./import-date-warning";
import {
  ImportMatchStep,
  defaultFilter,
  type Filter,
  type LookupStatus,
} from "./import-match-step";
import { ImportResultStep } from "./import-result-step";
import { ImportReviewStep, type ConflictMode } from "./import-review-step";
import { ImportSourceStep, type DirectSource } from "./import-source-step";
import { ImportValuesStep, type ValueSettings } from "./import-values-step";
import { TEXT_BUTTON_CLASS } from "./text-button";
import { WizardSteps, type Step } from "./wizard-steps";

const DIRECT_SOURCE_LABELS: Record<DirectSource, string> = {
  kaya: "KAYA",
  sendage: "Sendage",
  mountainproject: "Mountain Project",
};

type BatchError = { rows: ResolvedRow[]; message: string; uncertain: boolean };
type WizardResult = Omit<ImportResult, "missing" | "broken"> & {
  /** Rows whose climb was gone by the time the batch ran. */
  missing: ResolvedRow[];
  /** Rows the server refused because their climb broke before the row's date. */
  broken: ResolvedRow[];
  batchErrors: BatchError[];
  duplicates: number;
  /** Rows never sent to the server because the import stopped early. */
  notAttempted: ResolvedRow[];
  stopped: { kind: "cancelled" | "aborted"; message: string } | null;
};

const NOT_ATTEMPTED_MESSAGE = "the import stopped before reaching this row";

function toImportSendRow(resolved: ResolvedRow, climb: ClimbCandidate): ImportSendRow {
  const { row } = resolved;
  return {
    climbId: climb.id,
    ascentStyle: row.ascentStyle,
    dateSent: row.dateSent,
    rating: row.rating,
    comment: row.comment,
    gradeFeel: row.gradeFeel,
    gradeText: row.gradeText,
  };
}

function failedRowsForResult(
  importResult: WizardResult | null,
  invalid: InvalidImportRow[],
  resolved: ResolvedRow[] | null,
): (FailedImportRow & { rowIndex: number; label: string | null })[] {
  if (!importResult || !resolved) return [];
  const fromResolved = (r: ResolvedRow, reason: string) => ({
    rowIndex: r.row.rowIndex,
    raw: r.row.raw,
    label: r.row.climbName,
    reason,
  });
  return [
    ...invalid.map((row) => ({
      rowIndex: row.rowIndex,
      raw: row.raw,
      label: null,
      reason: row.reason,
    })),
    ...resolved.flatMap((r) => {
      if (r.state === "skipped") return [fromResolved(r, "Skipped")];
      if (r.state === "broken" && r.brokenBy) {
        return [fromResolved(r, brokenClimbImportReason(r.brokenBy.brokenOn, r.row.dateSent))];
      }
      if (r.state !== "attention") return [];
      return [
        fromResolved(
          r,
          r.match.kind === "none"
            ? "No climb with this name"
            : (r.match.kind === "ambiguous" && r.match.conflict) ||
                "Several climbs share this name and none was picked",
        ),
      ];
    }),
    ...importResult.missing.map((r) => fromResolved(r, "Climb no longer exists")),
    // The server refused these; normally the climb broke between the
    // lookup and the commit, so the client copy of it may not carry a date.
    ...importResult.broken.map((r) =>
      fromResolved(
        r,
        r.climb?.brokenOn
          ? brokenClimbImportReason(r.climb.brokenOn, r.row.dateSent)
          : "Climb has since been marked as broken; only ascents dated before the break can be logged",
      ),
    ),
    ...importResult.batchErrors.flatMap((batch) =>
      batch.rows.map((r) =>
        fromResolved(r, `${batch.uncertain ? "Unconfirmed" : "Not imported"}: ${batch.message}`),
      ),
    ),
    ...importResult.notAttempted.map((r) =>
      fromResolved(r, `Not imported: ${NOT_ATTEMPTED_MESSAGE}`),
    ),
  ].sort((a, b) => a.rowIndex - b.rowIndex);
}

/** Date corrections affect automatic matching. Keep this calculation independent
 * of manual picks and the running import's batch progress. */
function useImportMatching(
  baseNormalized: ReturnType<typeof normalizeImportRows> | null,
  candidateIndex: CandidateIndex | null,
  options: MatchOptions,
) {
  const [undatedDates, setUndatedDates] = useState<ReadonlySet<string>>(new Set());
  const dateClusters = findImportDateClusters(baseNormalized?.valid ?? []);
  // Date review changes only dates. Preserve row identities and manual climb
  // choices, and avoid repeating the name/area lookup when a checkbox changes.
  const normalized = baseNormalized && {
    ...baseNormalized,
    valid: baseNormalized.valid.map((row) =>
      row.dateSent && undatedDates.has(row.dateSent) ? { ...row, dateSent: null } : row,
    ),
  };

  const matches =
    normalized && candidateIndex ? matchRows(normalized.valid, candidateIndex, options) : null;
  return { dateClusters, normalized, matches, undatedDates, setUndatedDates };
}

type ImportWizardProps = { profileHref: string; viewerId?: string };

/** Start with a fresh draft when the account changes or a new import begins. */

export function ImportWizard({ profileHref, viewerId }: ImportWizardProps) {
  const [run, setRun] = useState(0);
  return (
    <ImportWizardRun
      key={`${viewerId ?? profileHref}:${run}`}
      profileHref={profileHref}
      viewerId={viewerId}
      onRestart={() => setRun((n) => n + 1)}
    />
  );
}

// oxlint-disable-next-line complexity -- multi-step wizard state machine; each step adds a branch
function ImportWizardRun({
  profileHref,
  viewerId,
  onRestart,
}: ImportWizardProps & {
  onRestart: () => void;
}) {
  const captureView = useViewGuard(viewerId ?? profileHref);
  const prefs = useGradePreferences();
  // A climber who reads Font or French most likely exported grades that way.
  const defaultGradeScale = preferredImportGradeScale(prefs);
  const [directSource, setDirectSource] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [pending, startTransition] = useTransition();

  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null);
  const [source, setSource] = useState<ImportSource>("unknown");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [valueSettings, setValueSettings] = useState<ValueSettings>({
    ascentStyleMapping: {},
    climbTypeMapping: {},
    gradeFeelMapping: {},
    ratingMapping: {},
    dateFormat: "iso",
    gradeScale: defaultGradeScale,
  });
  const { gradeScale } = valueSettings;
  const [dropPlaceholderDates, setDropPlaceholderDates] = useState(false);
  const [onConflict, setOnConflict] = useState<ConflictMode>("skip");

  const [baseNormalized, setNormalized] = useState<ReturnType<typeof normalizeImportRows> | null>(
    null,
  );

  const [candidateIndex, setCandidateIndex] = useState<CandidateIndex | null>(null);
  const [looseIndex, setLooseIndex] = useState<CandidateIndex>(new Map());
  const [lookup, setLookup] = useState<LookupStatus>({ phase: "done" });
  const lookupRunRef = useRef(0);
  const [preferredAreas, setPreferredAreas] = useState<PreferredArea[]>([]);
  const [manual, setManual] = useState<ReadonlyMap<number, ManualChoice>>(new Map());
  const [matchFilter, setMatchFilter] = useState<Filter | null>(null);

  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<WizardResult | null>(null);

  const [autoMapped, setAutoMapped] = useState(false);

  // The running async import reads cancellation from the ref; state updates the UI.
  const cancelRequestedRef = useRef(false);
  const [cancelRequested, setCancelRequested] = useState(false);

  // Leaving loses the progress report without rolling back committed batches.
  useEffect(() => {
    if (!pending) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  const { dateClusters, normalized, matches, undatedDates, setUndatedDates } = useImportMatching(
    baseNormalized,
    candidateIndex,
    { gradeScale, preferredAreas, looseIndex, prefs },
  );
  const resolved = normalized && matches ? resolveRows(normalized.valid, matches, manual) : null;
  const summary = resolved ? summarizeResolved(resolved) : null;
  const failures = failedRowsForResult(importResult, baseNormalized?.invalid ?? [], resolved);

  function guessValueSettings(parsed: ParsedCsv, mapping: ColumnMapping): ValueSettings {
    const dateSample = distinctValues(parsed.rows, mapping.date).slice(0, DATE_SAMPLE_SIZE);
    return {
      ascentStyleMapping: guessAscentStyleMapping(distinctValues(parsed.rows, mapping.ascentStyle)),
      climbTypeMapping: guessClimbTypeMapping(distinctValues(parsed.rows, mapping.climbType)),
      gradeFeelMapping: guessGradeFeelMapping(distinctValues(parsed.rows, mapping.gradeFeel)),
      ratingMapping: guessRatingMapping(
        distinctValues(parsed.rows, mapping.rating),
        detectImportSource([...parsed.headers, ...parsed.derived]),
      ),
      dateFormat: mapping.date ? detectDateFormat(dateSample) : "iso",
      gradeScale: detectGradeScale(
        distinctValues(parsed.rows, mapping.suggestedGrade ?? mapping.grade),
        defaultGradeScale,
      ),
    };
  }

  function handleColumnsNext() {
    if (!parsedCsv || !columnMapping) return;
    const missing = missingRequiredColumns(columnMapping);
    if (missing.length > 0) {
      setError(
        `Map the required column${missing.length > 1 ? "s" : ""} before continuing: ${missing
          .map(columnLabel)
          .join(", ")}.`,
      );
      return;
    }
    setError(null);
    setValueSettings(guessValueSettings(parsedCsv, columnMapping));
    setStep("values");
  }

  /** Batch name lookups, then recover capped matches through name-and-area lookups.
   * Superseded runs cannot update state; scale is explicit for same-tick uploads. */
  async function runLookup(valid: NormalizedImportRow[], scale: ImportGradePreference) {
    lookupRunRef.current += 1;
    const run = lookupRunRef.current;
    const isCurrent = captureView();
    const chunk = <T,>(items: T[]): T[][] =>
      Array.from({ length: Math.ceil(items.length / RESOLVE_BATCH_SIZE) }, (_, i) =>
        items.slice(i * RESOLVE_BATCH_SIZE, (i + 1) * RESOLVE_BATCH_SIZE),
      );
    setCandidateIndex(null);
    setLooseIndex(new Map());
    setMatchFilter(null);

    const nameChunks = chunk(distinctClimbNames(valid));
    let done = 0;
    let total = nameChunks.length;
    setLookup({ phase: "loading", done, total });

    let index: CandidateIndex = new Map();
    const request = async (
      call: () => Promise<{ ok: true; value: ClimbCandidate[] } | { ok: false; error: string }>,
      collect?: (found: ClimbCandidate[]) => void,
    ): Promise<boolean> => {
      const result = await call().catch(
        () => ({ ok: false, error: "The lookup request failed" }) as const,
      );
      if (!isCurrent() || lookupRunRef.current !== run) return false;
      if (!result.ok) {
        setLookup({ phase: "failed", error: result.error });
        return false;
      }
      if (collect) collect(result.value);
      else index = mergeCandidates(index, result.value);
      done += 1;
      setLookup({ phase: "loading", done, total });
      return true;
    };

    for (const names of nameChunks) {
      if (!(await request(() => resolveImportClimbs(names)))) return;
    }

    const pairChunks = chunk(areaLookupsNeeded(valid, index));
    total += pairChunks.length;
    for (const pairs of pairChunks) {
      if (!(await request(() => resolveImportClimbsInAreas(pairs)))) return;
    }

    // The lookup stays the indexed name query; matching decides what to trust.
    const lookups = looseLookupsNeeded(valid, index);
    const variantChunks = chunk(looseLookupNames(lookups));
    total += variantChunks.length;
    const recovered: ClimbCandidate[] = [];
    for (const variants of variantChunks) {
      if (
        !(await request(
          () => resolveImportClimbs(variants),
          (found) => {
            for (const candidate of found) recovered.push(candidate);
          },
        ))
      )
        return;
    }
    const loose = buildLooseIndex(lookups, recovered);

    setCandidateIndex(index);
    setLooseIndex(loose);
    const summary = summarizeResolved(
      resolveRows(
        valid,
        matchRows(valid, index, { gradeScale: scale, preferredAreas, looseIndex: loose, prefs }),
        new Map(),
      ),
    );
    setMatchFilter(defaultFilter(summary));
    setLookup({ phase: "done" });
  }

  /** Accept explicit inputs because upload can start matching before state updates render. */
  function beginMatching(
    parsed: ParsedCsv,
    mapping: ColumnMapping,
    values: ValueSettings,
    dropPlaceholders: boolean,
  ) {
    const result = normalizeImportRows(parsed, mapping, values, values.dateFormat, {
      gradeScalePreference: values.gradeScale,
      undatedValues: dropPlaceholders
        ? findPlaceholderTimestamps(parsed.rows, mapping.date).map((p) => p.value)
        : [],
    });
    setUndatedDates(new Set());
    setNormalized(result);
    // A remapped file invalidates choices tied to the old normalized rows.
    setManual(new Map());
    setStep("match");
    void runLookup(result.valid, values.gradeScale);
  }

  function handleValuesNext() {
    if (!parsedCsv || !columnMapping) return;
    setError(null);
    beginMatching(parsedCsv, columnMapping, valueSettings, dropPlaceholderDates);
  }

  function acceptParsedRows(parsed: ParsedCsv) {
    const detected = detectImportSource(parsed.headers);
    const withDerived = deriveSourceColumns(parsed, detected);
    const mapping = guessColumnMapping([...withDerived.headers, ...withDerived.derived]);
    // KAYA placeholder cleanup defaults on; other sources require the user to choose it.
    const dropPlaceholders = detected === "kaya";
    setParsedCsv(withDerived);
    setSource(detected);
    setColumnMapping(mapping);
    setDropPlaceholderDates(dropPlaceholders);

    // Known formats with required columns mapped can skip ahead.
    // Column and value mappings remain editable from the step list.
    const skipAhead = detected !== "unknown" && missingRequiredColumns(mapping).length === 0;
    setAutoMapped(skipAhead);
    if (skipAhead) {
      const values = guessValueSettings(withDerived, mapping);
      setValueSettings(values);
      beginMatching(withDerived, mapping, values, dropPlaceholders);
    } else {
      setStep("columns");
    }
  }

  async function handleFile(file: File) {
    if (reading) return;
    setError(null);
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError(
        `That CSV is larger than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB. Split it into smaller files and try again.`,
      );
      return;
    }

    const isCurrent = captureView();
    setReading(true);
    try {
      const text = await file.text();
      if (!isCurrent()) return;
      const parsed = parseCsvText(text);
      if (parsed.rows.length > MAX_IMPORT_ROWS) {
        setError(
          `That CSV has more than ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows. Split it into smaller files and try again.`,
        );
      } else if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("Couldn't find any data rows in that file.");
      } else {
        setDirectSource(null);
        acceptParsedRows(parsed);
      }
    } catch {
      setError("Couldn't read that file. Re-save it as a plain CSV and try again.");
    }
    setReading(false);
  }

  function handleMatchNext() {
    setError(null);
    setStep("review");
  }

  function goBack(target: Step) {
    if (pending) return;
    setError(null);
    if (target === "columns" || target === "values") setAutoMapped(false);
    setStep(target);
  }

  function handleFinalize() {
    if (!resolved) return;
    setError(null);
    cancelRequestedRef.current = false;
    setCancelRequested(false);
    const toImport = resolved.filter(
      (r): r is ResolvedRow & { climb: ClimbCandidate } => r.climb !== null,
    );
    const total = summary?.ready ?? 0;
    setProgress({
      completed: 0,
      total,
      imported: 0,
      overwritten: 0,
      alreadyLogged: 0,
      failed: 0,
      lastError: null,
    });

    const isCurrent = captureView();
    startTransition(async () => {
      const result = await runImportBatches(
        toImport.map((r) => toImportSendRow(r, r.climb)),
        (batch, batchId) =>
          importSends(batch, {
            gradeScale,
            onConflict,
            batchId,
            ...(viewerId !== undefined && { expectedOwnerId: viewerId }),
          }),
        { onProgress: setProgress, isCancelled: () => cancelRequestedRef.current, isCurrent },
      );
      if (!isCurrent()) return;
      setImportResult({
        ...result,
        duplicates: result.duplicates.length,
        missing: result.missing.map((index) => toImport[index]),
        broken: result.broken.map((index) => toImport[index]),
        batchErrors: result.batchErrors.map(({ indices, ...error }) => ({
          ...error,
          rows: indices.map((index) => toImport[index]),
        })),
        notAttempted: result.notAttempted.map((index) => toImport[index]),
      });
      setStep("result");
    });
  }

  function applyChoices(choices: { rowIndex: number; choice: ManualChoice | null }[]) {
    setManual((prev) => {
      const next = new Map(prev);
      for (const { rowIndex, choice } of choices) {
        if (choice) next.set(rowIndex, choice);
        else next.delete(rowIndex);
      }
      return next;
    });
  }

  function handleCancel() {
    cancelRequestedRef.current = true;
    setCancelRequested(true);
  }

  function handleDownloadFailedRows() {
    if (!parsedCsv) return;
    downloadCsv(buildFailedRowsCsv(parsedCsv.headers, failures), "failed-sends-import.csv");
  }

  return (
    <div className={`flex flex-col gap-6 ${cardClass("md")}`}>
      <div className="flex flex-col gap-3">
        <PageTitle>Import sends</PageTitle>
        <WizardSteps step={step} onJump={pending || step === "result" ? null : goBack} />
      </div>

      {error && <InlineAlert>{error}</InlineAlert>}

      {step === "upload" && (
        <ImportSourceStep
          key={profileHref}
          reading={reading}
          onFile={(file) => {
            void handleFile(file);
          }}
          onLoaded={(parsed, source, label) => {
            setError(null);
            setDirectSource(`${DIRECT_SOURCE_LABELS[source]} profile ${label}`);
            acceptParsedRows(parsed);
          }}
        />
      )}

      {step === "columns" && columnMapping && parsedCsv && (
        <ImportColumnsStep
          parsedCsv={parsedCsv}
          source={source}
          directSource={directSource}
          columnMapping={columnMapping}
          onChange={setColumnMapping}
          onBack={() => goBack("upload")}
          onNext={handleColumnsNext}
        />
      )}

      {step === "values" && (
        <ImportValuesStep
          rows={parsedCsv?.rows ?? []}
          source={source}
          columnMapping={columnMapping}
          values={valueSettings}
          onChange={setValueSettings}
          dropPlaceholderDates={dropPlaceholderDates}
          onDropPlaceholderDatesChange={setDropPlaceholderDates}
          onBack={() => goBack("columns")}
          onNext={handleValuesNext}
        />
      )}

      {(step === "match" || step === "review") && (
        <ImportDateWarning
          clusters={dateClusters}
          undatedDates={undatedDates}
          onChange={setUndatedDates}
          disabled={pending}
        />
      )}

      {step === "match" && normalized && (
        <div className="flex flex-col gap-6">
          {autoMapped && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">
                {directSource ?? `Recognized as a ${IMPORT_SOURCE_LABELS[source]}`}: columns and
                values were mapped automatically
                {gradeScale === "converted" && ", with grades read as Font / French"}.{" "}
                <button
                  type="button"
                  onClick={() => goBack("columns")}
                  className={TEXT_BUTTON_CLASS}
                >
                  Adjust the mapping
                </button>
              </p>
              {/* The columns step would have shown these; this path skipped it. */}
              {parsedCsv && (
                <CsvWarnings warnings={parsedCsv.warnings} subject={directSource ?? "Import"} />
              )}
            </div>
          )}
          <ImportMatchStep
            resolved={resolved}
            summary={summary}
            lookup={lookup}
            onRetryLookup={() => {
              void runLookup(normalized.valid, gradeScale);
            }}
            preferredAreas={preferredAreas}
            onPreferredAreasChange={setPreferredAreas}
            filter={matchFilter}
            onFilterChange={setMatchFilter}
            onChoose={(rowIndex, choice) => applyChoices([{ rowIndex, choice }])}
            onChooseMany={applyChoices}
          />
          <div className="flex gap-4">
            <Button variant="ghost" onPress={() => goBack("values")}>
              Back
            </Button>
            <Button onPress={handleMatchNext} isDisabled={resolved === null}>
              Next: Review
            </Button>
          </div>
        </div>
      )}

      {step === "review" && normalized && summary && (
        <ImportReviewStep
          summary={summary}
          invalid={normalized.invalid}
          warnings={normalized.warnings}
          pending={pending}
          progress={progress}
          onConflict={onConflict}
          onConflictChange={setOnConflict}
          cancelRequested={cancelRequested}
          onCancel={handleCancel}
          onShowMatches={(filter) => {
            setMatchFilter(filter);
            goBack("match");
          }}
          onBack={() => goBack("match")}
          onImport={handleFinalize}
        />
      )}

      {step === "result" && importResult && (
        <ImportResultStep
          result={importResult}
          failures={failures}
          profileHref={profileHref}
          onDownload={handleDownloadFailedRows}
          onRestart={onRestart}
        />
      )}
    </div>
  );
}
