"use client";

import { Button, Checkbox, Label } from "@heroui/react";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";

import {
  importSends,
  resolveImportClimbs,
  resolveImportClimbsInAreas,
  type ImportResult,
} from "@/actions";
import { GRADE_FEEL_OPTIONS } from "@/components/send-fields";
import { cardClass } from "@/components/ui/card";
import { choicePillClass } from "@/components/ui/choice-pill";
import { Eyebrow } from "@/components/ui/eyebrow";
import { InlineAlert } from "@/components/ui/inline-alert";
import { OptionSelect, type SelectOption } from "@/components/ui/option-select";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { SupportText } from "@/components/ui/support-text";
import { PageTitle } from "@/components/ui/typography";
import type { ClimbCandidate } from "@/db/queries";
import { downloadCsv } from "@/lib/download";
import { formatCount } from "@/lib/format";
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
  needsDateFormatChoice,
  normalizeImportRows,
  parseCsvText,
  parseDateWithFormat,
  valueCounts,
  DATE_SAMPLE_SIZE,
  IMPORT_SOURCE_LABELS,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  REQUIRED_COLUMN_KEYS,
  type AscentStyleMapping,
  type ClimbTypeMapping,
  type CoercionWarning,
  type ColumnMapping,
  type DateFormat,
  type FailedImportRow,
  type FieldKey,
  type GradeFeelMapping,
  type GradeScale,
  type ImportSource,
  type InvalidImportRow,
  type NormalizedImportRow,
  type ParsedCsv,
  type RatingMapping,
} from "@/lib/sends-import";

import { ImportDateWarning } from "./import-date-warning";
import {
  ImportMatchStep,
  defaultFilter,
  type Filter,
  type LookupStatus,
} from "./import-match-step";
import { ImportResultStep } from "./import-result-step";
import { ImportSourceStep, type DirectSource } from "./import-source-step";
import { TEXT_BUTTON_CLASS } from "./text-button";
import {
  ASCENT_STYLE_OPTIONS,
  CLIMB_TYPE_OPTIONS,
  RATING_OPTIONS,
  Stat,
  ValueMappingSection,
} from "./value-mapping-section";
import { WizardSteps, type Step } from "./wizard-steps";

const COLUMN_FIELDS: { key: FieldKey; label: string; hint: string }[] = [
  { key: "climbName", label: "Climb name", hint: "Matched against betabook's climbs by name." },
  {
    key: "ascentStyle",
    label: "Ascent style",
    hint: "Redpoint, flash, or onsight. Values are mapped on the next step; boulder onsights are saved as flashes.",
  },
  { key: "date", label: "Date sent", hint: "Any common date format." },
  {
    key: "areaName",
    label: "Area",
    hint: "The exact area or any parent. Leave blank to match on name alone.",
  },
  {
    key: "suggestedGrade",
    label: "Grade",
    hint: "The grade you logged, imported as your suggested grade. Blank means no suggestion.",
  },
  {
    key: "gradeFeel",
    label: "Grade feel",
    hint: "Low end, solid, or high end. Values are mapped on the next step.",
  },
  { key: "rating", label: "Rating", hint: "1 to 5 stars." },
  { key: "comment", label: "Comment", hint: "Notes on the send." },
  { key: "climbType", label: "Climb type", hint: "Only used to tell same-named climbs apart." },
  {
    key: "grade",
    label: "Posted grade",
    hint: "The climb's guidebook grade, if the file has it as a separate column. Only used when no Grade column is mapped.",
  },
];

function previewText(values: string[]): string {
  return values
    .slice(0, 3)
    .map((value) => (value.length > 32 ? `${value.slice(0, 31)}…` : value))
    .join(" · ");
}

function columnLabel(key: FieldKey): string {
  return COLUMN_FIELDS.find((f) => f.key === key)?.label ?? key;
}

// Column pickers key their options by prefixed header, so no header text can
// collide with the "None" choice.
const NO_COLUMN = "none";
const columnKey = (header: string) => `h:${header}`;
const headerOf = (key: string): string | null => (key === NO_COLUMN ? null : key.slice(2));

const DATE_FORMAT_OPTIONS: readonly SelectOption<DateFormat>[] = [
  { value: "iso", label: "Year first — 2019-10-15" },
  { value: "mdy", label: "Month first — 10/15/2019" },
  { value: "dmy", label: "Day first — 15/10/2019" },
];

const GRADE_SCALE_OPTIONS: readonly SelectOption<GradeScale>[] = [
  { value: "native", label: "Native (V-scale / YDS)" },
  { value: "converted", label: "Converted (Font / French)" },
];

const SOURCE_NOTES: Record<Exclude<ImportSource, "unknown">, string> = {
  betabook: "Every column maps back to the field it was exported from.",
  kaya: "KAYA location, region, and country columns are used as hints when a climb name matches in more than one place. Routes can match sport or trad climbs.",
  sendage: "“Country” is used as a hint when a climb name matches in more than one place.",
  mountainproject:
    "“Rating” is the route's grade and “Your Rating” yours. “Location” is the full area path, used as hints from the wall up. Ascent style comes from “Lead Style”, or from “Style” where that is blank.",
};

const DIRECT_SOURCE_LABELS: Record<DirectSource, string> = {
  kaya: "KAYA",
  sendage: "Sendage",
  mountainproject: "Mountain Project",
};

const CONFLICT_MODES = [
  { value: "skip", label: "Skip" },
  { value: "overwrite", label: "Overwrite" },
] as const;

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
    blankGradeMeans: row.blankGradeMeans,
  };
}

function CsvWarnings({ warnings, subject }: { warnings: readonly string[]; subject: string }) {
  if (warnings.length === 0) return null;
  return (
    <InlineAlert status="warning">
      <ul className="flex flex-col gap-1">
        {warnings.map((warning) => (
          <li key={warning}>
            <SupportText subject={subject}>{warning}</SupportText>
          </li>
        ))}
      </ul>
    </InlineAlert>
  );
}

// oxlint-disable-next-line complexity -- multi-step wizard state machine; each step adds a branch
export function ImportWizard({ profileHref }: { profileHref: string }) {
  const [directSource, setDirectSource] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [pending, startTransition] = useTransition();

  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null);
  const [source, setSource] = useState<ImportSource>("unknown");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [ascentStyleMapping, setAscentStyleMapping] = useState<AscentStyleMapping>({});
  const [climbTypeMapping, setClimbTypeMapping] = useState<ClimbTypeMapping>({});
  const [gradeFeelMapping, setGradeFeelMapping] = useState<GradeFeelMapping>({});
  const [ratingMapping, setRatingMapping] = useState<RatingMapping>({});
  const [dateFormat, setDateFormat] = useState<DateFormat>("iso");
  const [dropPlaceholderDates, setDropPlaceholderDates] = useState(false);
  const [gradeScale, setGradeScale] = useState<GradeScale>("native");
  const [onConflict, setOnConflict] = useState<"skip" | "overwrite">("skip");

  const [baseNormalized, setNormalized] = useState<{
    valid: NormalizedImportRow[];
    invalid: InvalidImportRow[];
    warnings: CoercionWarning[];
  } | null>(null);

  const [undatedDates, setUndatedDates] = useState<ReadonlySet<string>>(new Set());
  const dateClusters = useMemo(
    () => findImportDateClusters(baseNormalized?.valid ?? []),
    [baseNormalized],
  );
  // Date review changes only dates. Preserve row identities and manual climb
  // choices, and avoid repeating the name/area lookup when a checkbox changes.
  const normalized = useMemo(
    () =>
      baseNormalized && {
        ...baseNormalized,
        valid: baseNormalized.valid.map((row) =>
          row.dateSent && undatedDates.has(row.dateSent) ? { ...row, dateSent: null } : row,
        ),
      },
    [baseNormalized, undatedDates],
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

  const rows = useMemo(() => parsedCsv?.rows ?? [], [parsedCsv]);
  const ascentStyleValues = useMemo(
    () => valueCounts(rows, columnMapping?.ascentStyle ?? null),
    [rows, columnMapping?.ascentStyle],
  );
  const climbTypeValues = useMemo(
    () => valueCounts(rows, columnMapping?.climbType ?? null),
    [rows, columnMapping?.climbType],
  );
  const gradeFeelValues = useMemo(
    () => valueCounts(rows, columnMapping?.gradeFeel ?? null),
    [rows, columnMapping?.gradeFeel],
  );
  const ratingValues = useMemo(
    () => valueCounts(rows, columnMapping?.rating ?? null),
    [rows, columnMapping?.rating],
  );
  const dateValues = useMemo(
    () => distinctValues(rows, columnMapping?.date ?? null).slice(0, DATE_SAMPLE_SIZE),
    [rows, columnMapping?.date],
  );
  const placeholderDates = useMemo(
    () => findPlaceholderTimestamps(rows, columnMapping?.date ?? null),
    [rows, columnMapping?.date],
  );
  const placeholderRowCount = placeholderDates.reduce((sum, p) => sum + p.count, 0);

  const needsDateFormat = useMemo(() => needsDateFormatChoice(dateValues), [dateValues]);
  // Prefer an unparseable date sample so the preview exposes a problem with the chosen format.
  const dateSample = useMemo(
    () =>
      dateValues.find((v) => parseDateWithFormat(v, dateFormat) === null) ?? dateValues[0] ?? null,
    [dateValues, dateFormat],
  );
  const dateSamplePreview = dateSample ? parseDateWithFormat(dateSample, dateFormat) : null;

  const columnPreviews = useMemo(() => {
    const previews = new Map<string, string>();
    for (const column of [...(parsedCsv?.headers ?? []), ...(parsedCsv?.derived ?? [])]) {
      previews.set(column, previewText(distinctValues(rows, column)));
    }
    return previews;
  }, [parsedCsv?.headers, parsedCsv?.derived, rows]);

  // Manual choices do not affect automatic matching, so cache these separately.
  const matches = useMemo(
    () =>
      normalized && candidateIndex
        ? matchRows(normalized.valid, candidateIndex, { gradeScale, preferredAreas, looseIndex })
        : null,
    [normalized, candidateIndex, gradeScale, preferredAreas, looseIndex],
  );
  const resolved = useMemo(
    () => (normalized && matches ? resolveRows(normalized.valid, matches, manual) : null),
    [normalized, matches, manual],
  );
  const summary = useMemo(() => (resolved ? summarizeResolved(resolved) : null), [resolved]);

  const failures = useMemo((): (FailedImportRow & { rowIndex: number; label: string | null })[] => {
    if (!importResult || !normalized || !resolved) return [];
    const fromResolved = (r: ResolvedRow, reason: string) => ({
      rowIndex: r.row.rowIndex,
      raw: r.row.raw,
      label: r.row.climbName,
      reason,
    });
    return [
      ...normalized.invalid.map((row) => ({
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
  }, [importResult, normalized, resolved]);

  async function handleFile(file: File) {
    if (reading) return;
    setError(null);
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError(
        `That CSV is larger than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB. Split it into smaller files and try again.`,
      );
      return;
    }

    setReading(true);
    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      if (parsed.rows.length > MAX_IMPORT_ROWS) {
        setError(
          `That CSV has more than ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows. Split it into smaller files and try again.`,
        );
        return;
      }
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("Couldn't find any data rows in that file.");
        return;
      }

      setDirectSource(null);
      acceptParsedRows(parsed);
    } catch {
      setError("Couldn't read that file. Re-save it as a plain CSV and try again.");
    } finally {
      setReading(false);
    }
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
      const values = guessValueMappings(withDerived, mapping);
      applyValueMappings(values);
      beginMatching(withDerived, mapping, values, dropPlaceholders);
    } else {
      setStep("columns");
    }
  }

  function applyValueMappings(values: ReturnType<typeof guessValueMappings>) {
    setAscentStyleMapping(values.ascentStyleMapping);
    setClimbTypeMapping(values.climbTypeMapping);
    setGradeFeelMapping(values.gradeFeelMapping);
    setRatingMapping(values.ratingMapping);
    setDateFormat(values.dateFormat);
    setGradeScale(values.gradeScale);
  }

  function guessValueMappings(parsed: ParsedCsv, mapping: ColumnMapping) {
    const dateSample = distinctValues(parsed.rows, mapping.date).slice(0, DATE_SAMPLE_SIZE);
    return {
      ascentStyleMapping: guessAscentStyleMapping(distinctValues(parsed.rows, mapping.ascentStyle)),
      climbTypeMapping: guessClimbTypeMapping(distinctValues(parsed.rows, mapping.climbType)),
      gradeFeelMapping: guessGradeFeelMapping(distinctValues(parsed.rows, mapping.gradeFeel)),
      ratingMapping: guessRatingMapping(
        distinctValues(parsed.rows, mapping.rating),
        detectImportSource([...parsed.headers, ...parsed.derived]),
      ),
      dateFormat: mapping.date ? detectDateFormat(dateSample) : ("iso" as DateFormat),
      gradeScale: detectGradeScale(
        distinctValues(parsed.rows, mapping.suggestedGrade ?? mapping.grade),
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
    applyValueMappings(guessValueMappings(parsedCsv, columnMapping));
    setStep("values");
  }

  /** Accept explicit inputs because upload can start matching before state updates render. */
  function beginMatching(
    parsed: ParsedCsv,
    mapping: ColumnMapping,
    values: ReturnType<typeof guessValueMappings>,
    dropPlaceholders: boolean,
  ) {
    const result = normalizeImportRows(
      parsed,
      mapping,
      values.ascentStyleMapping,
      values.climbTypeMapping,
      values.gradeFeelMapping,
      values.ratingMapping,
      values.dateFormat,
      {
        gradeScalePreference: values.gradeScale,
        undatedValues: dropPlaceholders
          ? findPlaceholderTimestamps(parsed.rows, mapping.date).map((p) => p.value)
          : [],
      },
    );
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
    beginMatching(
      parsedCsv,
      columnMapping,
      {
        ascentStyleMapping,
        climbTypeMapping,
        gradeFeelMapping,
        ratingMapping,
        dateFormat,
        gradeScale,
      },
      dropPlaceholderDates,
    );
  }

  /** Batch name lookups, then recover capped matches through name-and-area lookups.
   * Superseded runs cannot update state; scale is explicit for same-tick uploads. */
  async function runLookup(valid: NormalizedImportRow[], scale: GradeScale) {
    lookupRunRef.current += 1;
    const run = lookupRunRef.current;
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
      if (lookupRunRef.current !== run) return false;
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
        matchRows(valid, index, { gradeScale: scale, preferredAreas, looseIndex: loose }),
        new Map(),
      ),
    );
    setMatchFilter(defaultFilter(summary));
    setLookup({ phase: "done" });
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

    startTransition(async () => {
      const result = await runImportBatches(
        toImport.map((r) => toImportSendRow(r, r.climb)),
        (batch, batchId) => importSends(batch, { gradeScale, onConflict, batchId }),
        { onProgress: setProgress, isCancelled: () => cancelRequestedRef.current },
      );
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

  function reset() {
    lookupRunRef.current += 1;
    setStep("upload");
    setParsedCsv(null);
    setSource("unknown");
    setDirectSource(null);
    setColumnMapping(null);
    setAscentStyleMapping({});
    setClimbTypeMapping({});
    setGradeFeelMapping({});
    setRatingMapping({});
    setDateFormat("iso");
    setDropPlaceholderDates(false);
    setGradeScale("native");
    setOnConflict("skip");
    setNormalized(null);
    setUndatedDates(new Set());
    setAutoMapped(false);
    setCandidateIndex(null);
    setLooseIndex(new Map());
    setLookup({ phase: "done" });
    setPreferredAreas([]);
    setManual(new Map());
    setMatchFilter(null);
    setProgress(null);
    setImportResult(null);
    setError(null);
    cancelRequestedRef.current = false;
    setCancelRequested(false);
  }

  const headers = parsedCsv?.headers ?? [];
  const columns = [...headers, ...(parsedCsv?.derived ?? [])];
  const mappedHeaders = new Set(
    columnMapping
      ? COLUMN_FIELDS.map(({ key }) => columnMapping[key]).filter((h): h is string => h !== null)
      : [],
  );

  const renderColumnField = ({ key, label, hint }: (typeof COLUMN_FIELDS)[number]): ReactNode => {
    if (!columnMapping) return null;
    const value = columnMapping[key];
    const preview = value ? columnPreviews.get(value) : null;
    return (
      // Allow the grid cell to shrink below a long preview's intrinsic width.
      <div key={key} className="flex min-w-0 flex-col gap-2">
        <Label>{label}</Label>
        <OptionSelect
          ariaLabel={label}
          value={value ? columnKey(value) : NO_COLUMN}
          onChange={(chosen) => setColumnMapping({ ...columnMapping, [key]: headerOf(chosen) })}
          options={[
            { value: NO_COLUMN, label: "None" },
            ...columns.map((column) => ({ value: columnKey(column), label: column })),
          ]}
        />
        <p className="mt-1.5 text-xs wrap-break-word text-muted">
          {preview ? `From the file: ${preview}` : hint}
        </p>
      </div>
    );
  };

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
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">
              Which column holds each field? {formatCount(parsedCsv.rows.length, "row")} found.
            </p>
            {source !== "unknown" && (
              <div className={cardClass("sm", "inset")}>
                <p className="text-sm font-medium">
                  {directSource ?? `Looks like a ${IMPORT_SOURCE_LABELS[source]}`}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Columns were mapped automatically. Check them below. {SOURCE_NOTES[source]}
                </p>
              </div>
            )}
            <CsvWarnings warnings={parsedCsv.warnings} subject={directSource ?? "Import"} />
          </div>

          <section className="flex flex-col gap-4 border-t border-separator pt-4">
            <Eyebrow>Required</Eyebrow>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {COLUMN_FIELDS.filter((f) => REQUIRED_COLUMN_KEYS.includes(f.key)).map(
                renderColumnField,
              )}
            </div>
          </section>

          <section className="flex flex-col gap-4 border-t border-separator pt-4">
            <Eyebrow>Optional</Eyebrow>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {COLUMN_FIELDS.filter((f) => !REQUIRED_COLUMN_KEYS.includes(f.key)).map(
                renderColumnField,
              )}
            </div>
          </section>

          <section className="flex flex-col gap-4 border-t border-separator pt-4">
            <div>
              <Eyebrow>Location hints</Eyebrow>
              <p className="mt-1 text-xs text-muted">
                Columns that roughly place a climb, such as a country, state, or boulder. They only
                break ties between climbs that share a name.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {headers
                .filter((header) => !mappedHeaders.has(header))
                .map((header) => {
                  const selected = columnMapping.areaHints.includes(header);
                  return (
                    <button
                      key={header}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setColumnMapping({
                          ...columnMapping,
                          areaHints: selected
                            ? columnMapping.areaHints.filter((h) => h !== header)
                            : [...columnMapping.areaHints, header],
                        })
                      }
                      className={choicePillClass(selected, "bg-surface text-foreground")}
                    >
                      {header}
                    </button>
                  );
                })}
              {headers.every((header) => mappedHeaders.has(header)) && (
                <p className="text-xs text-muted">Every column is already mapped to a field.</p>
              )}
            </div>
          </section>

          <div className="flex gap-4">
            <Button variant="ghost" onPress={() => goBack("upload")}>
              Back
            </Button>
            <Button onPress={handleColumnsNext}>Next: Values</Button>
          </div>
        </div>
      )}

      {step === "values" && (
        <div className="flex flex-col gap-6">
          <ValueMappingSection
            title="Ascent style"
            values={ascentStyleValues}
            mapping={ascentStyleMapping}
            onChange={setAscentStyleMapping}
            options={ASCENT_STYLE_OPTIONS}
            skipLabel="Skip these rows"
          />

          <ValueMappingSection
            title="Climb type"
            description="Only used to tell same-named climbs apart."
            values={climbTypeValues}
            mapping={climbTypeMapping}
            onChange={setClimbTypeMapping}
            options={CLIMB_TYPE_OPTIONS}
            skipLabel="Ignore"
          />

          <ValueMappingSection
            title="Rating"
            description={
              source === "mountainproject"
                ? "Mountain Project's four stars are spread across Betabook's five. Change any row that should land elsewhere."
                : "How each star value in the file imports."
            }
            values={ratingValues}
            mapping={ratingMapping}
            onChange={setRatingMapping}
            options={RATING_OPTIONS}
            skipLabel="Unrated"
          />

          <ValueMappingSection
            title="Grade feel"
            values={gradeFeelValues}
            mapping={gradeFeelMapping}
            onChange={setGradeFeelMapping}
            options={GRADE_FEEL_OPTIONS}
            skipLabel="Ignore (use solid)"
          />

          {columnMapping?.date && (
            <section className="flex flex-col gap-3">
              <Eyebrow>Dates</Eyebrow>
              {/* Only asked when the file is genuinely ambiguous. A column of
                  "2019-10-15" or "Sun Sep 22 2019" reads the same way under
                  every option, and offering a choice that changes nothing
                  reads as "your dates aren't supported". */}
              {needsDateFormat ? (
                <>
                  <div className="flex flex-col gap-2">
                    <Label>Date format</Label>
                    <OptionSelect
                      ariaLabel="Date format"
                      value={dateFormat}
                      onChange={setDateFormat}
                      options={DATE_FORMAT_OPTIONS}
                    />
                  </div>
                  <p className="text-xs text-muted">
                    This file has all-numeric dates, so 05/06/2019 could be May 6th or June 5th.
                    Pick the order the file uses.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted">
                  Dates in this column are unambiguous and are read automatically.
                </p>
              )}
              {/* A worked example from the file itself: the setting is easy to
                  get backwards, and this shows the mistake before the import
                  rather than after. */}
              {dateSample && (
                <p className="text-xs text-muted">
                  {dateSamplePreview
                    ? `“${dateSample}” will import as ${dateSamplePreview}.`
                    : `“${dateSample}” can’t be read as a date${needsDateFormat ? " this way" : ""}.`}
                </p>
              )}
              {placeholderDates.length > 0 && (
                <Checkbox isSelected={dropPlaceholderDates} onChange={setDropPlaceholderDates}>
                  <Checkbox.Content>
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <span className="text-sm">
                      Import the {formatCount(placeholderRowCount, "row")} dated “
                      {placeholderDates[0].value}” without a date.
                      <span className="block text-xs text-muted">
                        These rows share one exact timestamp
                        {source === "kaya"
                          ? ". KAYA fills in the export time for sends logged without a date."
                          : ", which is usually the export time standing in for a missing date."}
                      </span>
                    </span>
                  </Checkbox.Content>
                </Checkbox>
              )}
            </section>
          )}

          {(columnMapping?.grade || columnMapping?.suggestedGrade) && (
            <section className="flex flex-col gap-3">
              <Eyebrow>Grades</Eyebrow>
              <div className="flex flex-col gap-2">
                <Label>Grade notation</Label>
                <OptionSelect
                  ariaLabel="Grade notation"
                  value={gradeScale}
                  onChange={setGradeScale}
                  options={GRADE_SCALE_OPTIONS}
                />
              </div>
            </section>
          )}

          <div className="flex gap-4">
            <Button variant="ghost" onPress={() => goBack("columns")}>
              Back
            </Button>
            <Button onPress={handleValuesNext}>Next: Climbs</Button>
          </div>
        </div>
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

      {step === "review" && normalized && resolved && summary && (
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
              value={normalized.invalid.length + summary.broken}
              tone={normalized.invalid.length + summary.broken > 0 ? "danger" : undefined}
            />
          </div>

          {summary.broken > 0 && (
            <p className="text-sm text-muted">
              {formatCount(summary.broken, "row")}{" "}
              {summary.broken === 1 ? "names a climb" : "name climbs"} that broke before the
              ascent&rsquo;s date, so {summary.broken === 1 ? "it" : "they"} can&rsquo;t be
              imported.{" "}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setMatchFilter("broken");
                  goBack("match");
                }}
                className={TEXT_BUTTON_CLASS}
              >
                Back to matching
              </button>
            </p>
          )}

          {summary.attention > 0 && (
            <p className="text-sm text-muted">
              {formatCount(summary.attention, "row")} {summary.attention === 1 ? "has" : "have"} no
              matching climb and will be skipped.{" "}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setMatchFilter("attention");
                  goBack("match");
                }}
                className={TEXT_BUTTON_CLASS}
              >
                Back to matching
              </button>
            </p>
          )}

          {summary.review > 0 && (
            <p className="text-sm text-muted">
              {formatCount(summary.review, "row")} {summary.review === 1 ? "was" : "were"} matched
              by inference from the file&apos;s hints and grades, not by name alone.{" "}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setMatchFilter("review");
                  goBack("match");
                }}
                className={TEXT_BUTTON_CLASS}
              >
                Check them
              </button>
            </p>
          )}

          {normalized.invalid.length > 0 && (
            <details>
              <summary className={`${TEXT_BUTTON_CLASS} text-sm text-muted`}>
                View rows that can&apos;t be imported
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
                {normalized.invalid.map((row) => (
                  <li key={row.rowIndex}>
                    Row {row.rowIndex + 1}: {row.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {normalized.warnings.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm">Some values will be adjusted during import:</p>
              <InlineAlert status="warning">
                <ul className="flex flex-col gap-1">
                  {normalized.warnings.map((warning) => (
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
              <ProgressBar
                value={progress.completed}
                max={progress.total}
                label="Importing sends"
              />
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
                <Button variant="ghost" onPress={handleCancel} isDisabled={cancelRequested}>
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
                  onChange={setOnConflict}
                  options={CONFLICT_MODES}
                  className="lg:w-auto lg:self-start"
                />
              </fieldset>
              {onConflict === "overwrite" ? (
                <InlineAlert status="warning">
                  Imported values will replace your existing send data for any already-logged
                  climbs. This cannot be undone.
                </InlineAlert>
              ) : (
                <p className="text-sm text-muted">
                  Climbs you&apos;ve already logged are left untouched and counted as already
                  logged.
                </p>
              )}

              <div className="flex gap-4">
                <Button variant="ghost" onPress={() => goBack("match")}>
                  Back
                </Button>
                <Button onPress={handleFinalize} isDisabled={summary.ready === 0}>
                  Import {formatCount(summary.ready, "send")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {step === "result" && importResult && (
        <ImportResultStep
          result={importResult}
          failures={failures}
          profileHref={profileHref}
          onDownload={handleDownloadFailedRows}
          onRestart={reset}
        />
      )}
    </div>
  );
}
