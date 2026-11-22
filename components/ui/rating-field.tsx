"use client";
import { Label } from "@heroui/react";
import { clsx } from "clsx";
import { Star } from "lucide-react";
import { useId, useState } from "react";

import { useRovingRadioGroup } from "@/hooks/use-roving-radio-group";

const RATING_VALUES = [1, 2, 3, 4, 5];

function RatingPicker({
  value,
  onChange,
  label,
  compact,
  allowClear,
}: {
  label: { "aria-label": string } | { "aria-labelledby": string };
  compact: boolean;
  allowClear: boolean;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value ?? 0;
  const radioProps = useRovingRadioGroup({
    count: RATING_VALUES.length,
    selectedIndex: value === null ? -1 : value - 1,
    onSelect: (index) => onChange(RATING_VALUES[index]),
  });

  return (
    <div
      role="radiogroup"
      {...label}
      className="flex items-center"
      onMouseLeave={() => setHovered(null)}
    >
      {RATING_VALUES.map((n, index) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
          {...radioProps(index)}
          onClick={() => {
            setHovered(null);
            onChange(allowClear && value === n ? null : n);
          }}
          onMouseEnter={() => setHovered(n)}
          onFocus={() => setHovered(n)}
          onBlur={() => setHovered(null)}
          className="cursor-pointer rounded-md p-1 transition-colors focus-visible:status-focused"
        >
          <Star
            className={clsx(
              "transition-colors",
              compact ? "size-4" : "size-7",
              n <= shown ? "fill-current text-warning" : "text-muted",
            )}
          />
        </button>
      ))}
    </div>
  );
}

export function RatingField({
  value,
  onValueChange,
  label = "Rating",
  hideLabel = false,
  compact = false,
  allowClear = true,
}: {
  value: number | null;
  onValueChange: (value: number | null) => void;
  label?: string;
  hideLabel?: boolean;
  compact?: boolean;
  allowClear?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-1">
      {!hideLabel && (
        <Label id={labelId} elementType="span">
          {label}
        </Label>
      )}
      <RatingPicker
        label={hideLabel ? { "aria-label": label } : { "aria-labelledby": labelId }}
        value={value}
        onChange={onValueChange}
        compact={compact}
        allowClear={allowClear}
      />
    </div>
  );
}
