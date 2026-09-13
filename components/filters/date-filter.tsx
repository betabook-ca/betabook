"use client";

import { Button } from "@heroui/react";
import { getLocalTimeZone, today } from "@internationalized/date";
import { useState } from "react";

import { DatePickerField } from "@/components/ui/date-picker-field";
import { FIELD_WIDTH_CLASS, FILTER_ROW_CLASS, FILTER_LABEL_CLASS } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { OptionSelect } from "@/components/ui/option-select";
import {
  datePresetFilter,
  type DateFilterValue,
  type RelativeDatePreset,
} from "@/lib/filters/date-filter";

const OPTIONS = [
  { value: "any", label: "All time" },
  { value: "this-month", label: "This month" },
  { value: "this-year", label: "This year" },
  { value: "last-year", label: "Last year" },
  { value: "custom", label: "Custom dates" },
] as const;
type DateOption = RelativeDatePreset | "any" | "custom";

function selectedOption(value: DateFilterValue): DateOption {
  if (value.datePreset) return value.datePreset;
  return value.date || value.dateFrom || value.dateTo ? "custom" : "any";
}

function dateFingerprint(value: DateFilterValue): string {
  return JSON.stringify([value.date, value.dateFrom, value.dateTo, value.datePreset]);
}

/** Valid edits feed the parent toolbar's debounced navigation; incomplete ranges stay local. */
export function DateFilter({
  value,
  onChange,
  referenceDate,
}: {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
  /** Fixed civil date for deterministic previews. Live use reads the local date on selection. */
  referenceDate?: string;
}) {
  const incomingStart = value.date ?? value.dateFrom ?? "";
  const incomingEnd = value.dateTo ?? "";
  const fingerprint = dateFingerprint(value);
  const [previous, setPrevious] = useState(fingerprint);
  const [emitted, setEmitted] = useState<string | null>(null);
  const [option, setOption] = useState<DateOption>(selectedOption(value));
  const [start, setStart] = useState(incomingStart);
  const [end, setEnd] = useState(incomingEnd);
  if (previous !== fingerprint) {
    setPrevious(fingerprint);
    if (fingerprint !== emitted) {
      setOption(selectedOption(value));
      setStart(incomingStart);
      setEnd(incomingEnd);
    }
    setEmitted(null);
  }
  const reversed = !!start && !!end && start > end;
  function updateCustom(nextStart: string, nextEnd: string) {
    setStart(nextStart);
    setEnd(nextEnd);
    if (!nextStart || (nextEnd && nextEnd < nextStart)) return;
    const singleDay = !nextEnd || nextStart === nextEnd;
    const nextValue: DateFilterValue = {
      date: singleDay ? nextStart : undefined,
      dateFrom: singleDay ? undefined : nextStart,
      dateTo: singleDay ? undefined : nextEnd,
      datePreset: undefined,
    };
    setEmitted(dateFingerprint(nextValue));
    onChange(nextValue);
  }
  function select(next: DateOption) {
    setEmitted(null);
    setOption(next);
    if (next === "custom") return;
    if (next === "any") {
      setStart("");
      setEnd("");
      onChange({ date: undefined, dateFrom: undefined, dateTo: undefined, datePreset: undefined });
    } else {
      onChange(datePresetFilter(next, referenceDate ?? today(getLocalTimeZone()).toString()));
    }
  }
  return (
    <div className="flex w-full flex-col gap-3">
      <div className={FILTER_ROW_CLASS}>
        <span className={FILTER_LABEL_CLASS}>Dates</span>
        <OptionSelect
          ariaLabel="Dates"
          value={option}
          onChange={select}
          options={OPTIONS}
          className={FIELD_WIDTH_CLASS.medium}
        />
      </div>
      {option === "custom" && (
        <>
          <div className="flex flex-wrap gap-3 sm:ml-27">
            <div className={FIELD_WIDTH_CLASS.medium}>
              <DatePickerField
                label="Start date"
                value={start}
                onChange={(date) => updateCustom(date, end)}
                description="Choose a day, or the first day of a range."
              />
            </div>
            <div className={`${FIELD_WIDTH_CLASS.medium} flex flex-col gap-1`}>
              <DatePickerField
                label="End date (optional)"
                value={end}
                onChange={(date) => updateCustom(start, date)}
                description="Leave blank for one day. A range includes both dates."
              />
              {end && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  onPress={() => updateCustom(start, "")}
                >
                  Clear end date
                </Button>
              )}
            </div>
          </div>
          {reversed && <InlineAlert>End date must be on or after start date.</InlineAlert>}
        </>
      )}
    </div>
  );
}
