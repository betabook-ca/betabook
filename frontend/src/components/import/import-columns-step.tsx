"use client";

import { Button, Label } from "@heroui/react";

import { cardClass } from "@/components/ui/card";
import { choicePillClass } from "@/components/ui/choice-pill";
import { Eyebrow } from "@/components/ui/eyebrow";
import { OptionSelect } from "@/components/ui/option-select";
import { formatCount } from "@/lib/format";
import {
  distinctValues,
  IMPORT_SOURCE_LABELS,
  REQUIRED_COLUMN_KEYS,
  type ColumnMapping,
  type FieldKey,
  type ImportSource,
  type ParsedCsv,
} from "@/lib/sends-import";

import { CsvWarnings } from "./csv-warnings";

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
    hint: "The grade you logged, imported as your suggested grade. Blank takes the climb’s listed grade, or keeps the grade of a send you overwrite.",
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

export function columnLabel(key: FieldKey): string {
  return COLUMN_FIELDS.find((f) => f.key === key)?.label ?? key;
}

function previewText(values: string[]): string {
  return values
    .slice(0, 3)
    .map((value) => (value.length > 32 ? `${value.slice(0, 31)}…` : value))
    .join(" · ");
}

// Column pickers key their options by prefixed header, so no header text can
// collide with the "None" choice.
const NO_COLUMN = "none";
const columnKey = (header: string) => `h:${header}`;
const headerOf = (key: string): string | null => (key === NO_COLUMN ? null : key.slice(2));

const SOURCE_NOTES: Record<Exclude<ImportSource, "unknown">, string> = {
  betabook: "Every column maps back to the field it was exported from.",
  kaya: "KAYA location, region, and country columns are used as hints when a climb name matches in more than one place. Routes can match sport or trad climbs.",
  sendage: "“Country” is used as a hint when a climb name matches in more than one place.",
  mountainproject:
    "“Rating” is the route's grade and “Your Rating” yours. “Location” is the full area path, used as hints from the wall up. Ascent style comes from “Lead Style”, or from “Style” where that is blank.",
};

/** Step 2: which file column feeds each send field, plus the leftover
 * columns that can break ties between same-named climbs. */
export function ImportColumnsStep({
  parsedCsv,
  source,
  directSource,
  columnMapping,
  onChange,
  onBack,
  onNext,
}: {
  parsedCsv: ParsedCsv;
  source: ImportSource;
  /** "KAYA profile @name" when the rows came from a profile rather than a file. */
  directSource: string | null;
  columnMapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const { headers, derived, rows } = parsedCsv;
  const columns = [...headers, ...derived];
  const columnPreviews = new Map(
    columns.map((column) => [column, previewText(distinctValues(rows, column))]),
  );
  const mappedHeaders = new Set(
    COLUMN_FIELDS.map(({ key }) => columnMapping[key]).filter((h): h is string => h !== null),
  );

  const renderColumnField = ({ key, label, hint }: (typeof COLUMN_FIELDS)[number]) => {
    const value = columnMapping[key];
    const preview = value ? columnPreviews.get(value) : null;
    return (
      // Allow the grid cell to shrink below a long preview's intrinsic width.
      <div key={key} className="flex min-w-0 flex-col gap-2">
        <Label>{label}</Label>
        <OptionSelect
          ariaLabel={label}
          value={value ? columnKey(value) : NO_COLUMN}
          onChange={(chosen) => onChange({ ...columnMapping, [key]: headerOf(chosen) })}
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted">
          Which column holds each field? {formatCount(rows.length, "row")} found.
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
          {COLUMN_FIELDS.filter((f) => REQUIRED_COLUMN_KEYS.includes(f.key)).map(renderColumnField)}
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
                    onChange({
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
        <Button variant="ghost" onPress={onBack}>
          Back
        </Button>
        <Button onPress={onNext}>Next: Values</Button>
      </div>
    </div>
  );
}
