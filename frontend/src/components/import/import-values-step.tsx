"use client";

import { Button, Checkbox, Label } from "@heroui/react";

import { GRADE_FEEL_OPTIONS } from "@/components/sends/send-fields";
import { Eyebrow } from "@/components/ui/eyebrow";
import { OptionSelect, type SelectOption } from "@/components/ui/option-select";
import { formatCount } from "@/lib/format";
import type { ImportGradePreference } from "@/lib/grades";
import {
  distinctValues,
  findPlaceholderTimestamps,
  needsDateFormatChoice,
  parseDateWithFormat,
  valueCounts,
  DATE_SAMPLE_SIZE,
  type ColumnMapping,
  type DateFormat,
  type ImportSource,
  type ParsedCsv,
  type ValueMappings,
} from "@/lib/sends-import";

import {
  ASCENT_STYLE_OPTIONS,
  CLIMB_TYPE_OPTIONS,
  RATING_OPTIONS,
  ValueMappingSection,
} from "./value-mapping-section";

/** How the file's values read: the value mappings plus date order and grade notation. */
export type ValueSettings = ValueMappings & {
  dateFormat: DateFormat;
  gradeScale: ImportGradePreference;
};

const DATE_FORMAT_OPTIONS: readonly SelectOption<DateFormat>[] = [
  { value: "iso", label: "Year first — 2019-10-15" },
  { value: "mdy", label: "Month first — 10/15/2019" },
  { value: "dmy", label: "Day first — 15/10/2019" },
];

const GRADE_SCALE_OPTIONS: readonly SelectOption<ImportGradePreference>[] = [
  { value: "native", label: "Native (V-scale / YDS)" },
  { value: "converted", label: "Converted (Font / French)" },
];

/** Step 3: what each distinct value in the mapped columns imports as. */
export function ImportValuesStep({
  rows,
  source,
  columnMapping,
  values,
  onChange,
  dropPlaceholderDates,
  onDropPlaceholderDatesChange,
  onBack,
  onNext,
}: {
  rows: ParsedCsv["rows"];
  source: ImportSource;
  columnMapping: ColumnMapping | null;
  values: ValueSettings;
  onChange: (values: ValueSettings) => void;
  dropPlaceholderDates: boolean;
  onDropPlaceholderDatesChange: (drop: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const set = <K extends keyof ValueSettings>(key: K) => {
    return (value: ValueSettings[K]) => onChange({ ...values, [key]: value });
  };

  const ascentStyleValues = valueCounts(rows, columnMapping?.ascentStyle ?? null);
  const climbTypeValues = valueCounts(rows, columnMapping?.climbType ?? null);
  const gradeFeelValues = valueCounts(rows, columnMapping?.gradeFeel ?? null);
  const ratingValues = valueCounts(rows, columnMapping?.rating ?? null);

  return (
    <div className="flex flex-col gap-6">
      <ValueMappingSection
        title="Ascent style"
        values={ascentStyleValues}
        mapping={values.ascentStyleMapping}
        onChange={set("ascentStyleMapping")}
        options={ASCENT_STYLE_OPTIONS}
        skipLabel="Skip these rows"
      />

      <ValueMappingSection
        title="Climb type"
        description="Only used to tell same-named climbs apart."
        values={climbTypeValues}
        mapping={values.climbTypeMapping}
        onChange={set("climbTypeMapping")}
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
        mapping={values.ratingMapping}
        onChange={set("ratingMapping")}
        options={RATING_OPTIONS}
        skipLabel="Unrated"
      />

      <ValueMappingSection
        title="Grade feel"
        values={gradeFeelValues}
        mapping={values.gradeFeelMapping}
        onChange={set("gradeFeelMapping")}
        options={GRADE_FEEL_OPTIONS}
        skipLabel="Ignore (use solid)"
      />

      {columnMapping?.date && (
        <DateSettings
          rows={rows}
          dateColumn={columnMapping.date}
          source={source}
          dateFormat={values.dateFormat}
          onDateFormatChange={set("dateFormat")}
          dropPlaceholderDates={dropPlaceholderDates}
          onDropPlaceholderDatesChange={onDropPlaceholderDatesChange}
        />
      )}

      {(columnMapping?.grade || columnMapping?.suggestedGrade) && (
        <section className="flex flex-col gap-3">
          <Eyebrow>Grades</Eyebrow>
          <div className="flex flex-col gap-2">
            <Label>Grade notation</Label>
            <OptionSelect
              ariaLabel="Grade notation"
              value={values.gradeScale}
              onChange={set("gradeScale")}
              options={GRADE_SCALE_OPTIONS}
            />
          </div>
        </section>
      )}

      <div className="flex gap-4">
        <Button variant="ghost" onPress={onBack}>
          Back
        </Button>
        <Button onPress={onNext}>Next: Climbs</Button>
      </div>
    </div>
  );
}

/** How the date column reads, with a worked example from the file and the
 * option to drop a timestamp that stands in for missing dates. */
function DateSettings({
  rows,
  dateColumn,
  source,
  dateFormat,
  onDateFormatChange,
  dropPlaceholderDates,
  onDropPlaceholderDatesChange,
}: {
  rows: ParsedCsv["rows"];
  dateColumn: string;
  source: ImportSource;
  dateFormat: DateFormat;
  onDateFormatChange: (format: DateFormat) => void;
  dropPlaceholderDates: boolean;
  onDropPlaceholderDatesChange: (drop: boolean) => void;
}) {
  const dateValues = distinctValues(rows, dateColumn).slice(0, DATE_SAMPLE_SIZE);
  const placeholderDates = findPlaceholderTimestamps(rows, dateColumn);
  const placeholderRowCount = placeholderDates.reduce((sum, p) => sum + p.count, 0);

  const needsDateFormat = needsDateFormatChoice(dateValues);
  // Prefer an unparseable date sample so the preview exposes a problem with the chosen format.
  const dateSample =
    dateValues.find((v) => parseDateWithFormat(v, dateFormat) === null) ?? dateValues[0] ?? null;
  const dateSamplePreview = dateSample ? parseDateWithFormat(dateSample, dateFormat) : null;

  return (
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
              onChange={onDateFormatChange}
              options={DATE_FORMAT_OPTIONS}
            />
          </div>
          <p className="text-xs text-muted">
            This file has all-numeric dates, so 05/06/2019 could be May 6th or June 5th. Pick the
            order the file uses.
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
        <Checkbox isSelected={dropPlaceholderDates} onChange={onDropPlaceholderDatesChange}>
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
  );
}
