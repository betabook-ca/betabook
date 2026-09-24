"use client";

import { Calendar, Checkbox, DateField, DatePicker, Description, Label } from "@heroui/react";
import { parseDate, type CalendarDate } from "@internationalized/date";

import { FIELD_HEIGHT_CLASS, FIELD_WIDTH_CLASS } from "@/components/ui/field";
import { FieldFeedback } from "@/components/ui/field-support";

function toCalendarDate(value: string | undefined): CalendarDate | null {
  if (!value) return null;
  try {
    return parseDate(value);
  } catch {
    return null;
  }
}

type DatePickerFieldProps = {
  label: string;
  /** ISO `YYYY-MM-DD`, or "" for no date. */
  value: string;
  onChange: (value: string) => void;
  /** Latest selectable day, ISO — later days render struck through. */
  max?: string;
  isReadOnly?: boolean;
  isDisabled?: boolean;
  description?: string;
  error?: string | null;
  /** Renders an "I don't know" checkbox to the right of the field for a date
   * the user can't recall. Checked mirrors an empty value, so the caller
   * empties or restores the date here and typing a date unchecks it. */
  onUnknownChange?: (unknown: boolean) => void;
};

/** The app's date field: a segmented input plus a calendar popover, themed from
 * the same tokens as every other surface. A native `<input type="date">` draws
 * its own popover instead, which no CSS here can reach. */
export function DatePickerField({
  label,
  value,
  onChange,
  max,
  isReadOnly,
  isDisabled,
  description,
  error,
  onUnknownChange,
}: DatePickerFieldProps) {
  const maxDate = toCalendarDate(max);

  const picker = (
    <DatePicker
      className={FIELD_WIDTH_CLASS.medium}
      value={toCalendarDate(value)}
      maxValue={maxDate}
      isReadOnly={isReadOnly}
      isDisabled={isDisabled}
      isInvalid={Boolean(error)}
      // Segments are padded individually; unpadded, the field's width jumps.
      shouldForceLeadingZeros
      onChange={(date) => onChange(date?.toString() ?? "")}
    >
      <Label>{label}</Label>
      <DateField.Group fullWidth className={FIELD_HEIGHT_CLASS}>
        <DateField.InputContainer>
          <DateField.Input>
            {(segment: DateField["SegmentProps"]["segment"]) => (
              <DateField.Segment segment={segment} className="text-sm!" />
            )}
          </DateField.Input>
        </DateField.InputContainer>
        <DateField.Suffix>
          <DatePicker.Trigger>
            <DatePicker.TriggerIndicator />
          </DatePicker.Trigger>
        </DateField.Suffix>
      </DateField.Group>
      {description && <Description>{description}</Description>}
      {error && <FieldFeedback error={error} className="text-danger" />}
      <DatePicker.Popover>
        {/* Not redundant: HeroUI's Calendar always passes its grid an explicit
         * maxValue, defaulting to 2099-12-31, which overrides the DatePicker's. */}
        <Calendar maxValue={maxDate}>
          <Calendar.Header>
            <Calendar.YearPickerTrigger>
              <Calendar.YearPickerTriggerHeading />
              <Calendar.YearPickerTriggerIndicator />
            </Calendar.YearPickerTrigger>
            <Calendar.NavButton slot="previous" />
            <Calendar.NavButton slot="next" />
          </Calendar.Header>
          <Calendar.Grid>
            <Calendar.GridHeader>
              {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
            </Calendar.GridHeader>
            <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
          </Calendar.Grid>
          <Calendar.YearPickerGrid>
            <Calendar.YearPickerGridBody />
          </Calendar.YearPickerGrid>
        </Calendar>
      </DatePicker.Popover>
    </DatePicker>
  );

  if (!onUnknownChange || isReadOnly) return picker;

  return (
    <div className="flex items-end gap-4">
      {picker}
      <Checkbox isSelected={value === ""} onChange={onUnknownChange} isDisabled={isDisabled}>
        <Checkbox.Content className="flex h-10 items-center">
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          I don&apos;t know
        </Checkbox.Content>
      </Checkbox>
    </div>
  );
}
