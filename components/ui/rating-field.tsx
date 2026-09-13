"use client";
import { Label, TextField } from "@heroui/react";
import { clsx } from "clsx";
import { Star } from "lucide-react";
import { useState } from "react";

const RATING_VALUES = [1, 2, 3, 4, 5];

function RatingPicker({
  value,
  onChange,
  label,
  compact,
  allowClear,
}: {
  label: string;
  compact: boolean;
  allowClear: boolean;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? value ?? 0;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center"
      onMouseLeave={() => setHovered(null)}
    >
      {RATING_VALUES.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
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
  return (
    <TextField>
      {!hideLabel && <Label>{label}</Label>}
      <RatingPicker
        label={label}
        value={value}
        onChange={onValueChange}
        compact={compact}
        allowClear={allowClear}
      />
    </TextField>
  );
}
