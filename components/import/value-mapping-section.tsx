import { clsx } from "clsx";

import { ASCENT_STYLE_LABELS } from "@/components/ascent-style";
import { GRADE_FEEL_LABELS } from "@/components/send-fields";
import { DISCIPLINE_LABELS } from "@/components/ui/discipline-chip";
import { Eyebrow, EYEBROW_CLASS } from "@/components/ui/eyebrow";
import { OptionSelect, type SelectOption } from "@/components/ui/option-select";
import { formatCount } from "@/lib/format";
import { ASCENT_STYLES, GRADE_FEEL_VALUES } from "@/lib/sends";
import { CLIMB_TYPES } from "@/lib/sends-import";

/** A stat the review and result steps lead with — the number, then what it
 * counts. */
export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger" | "warning";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className={EYEBROW_CLASS}>{label}</span>
      <span
        className={clsx(
          "font-display text-3xl font-semibold tabular-nums",
          tone === "danger"
            ? "text-danger"
            : tone === "warning"
              ? "text-warning"
              : "text-foreground",
        )}
      >
        {value.toLocaleString("en-US")}
      </span>
    </div>
  );
}

export function ValueMappingSection<V extends string>({
  title,
  description,
  values,
  mapping,
  onChange,
  options,
  skipLabel,
}: {
  title: string;
  description?: string;
  values: { value: string; count: number }[];
  mapping: Record<string, V | "skip">;
  onChange: (mapping: Record<string, V | "skip">) => void;
  options: readonly SelectOption<V>[];
  skipLabel: string;
}) {
  if (values.length === 0) return null;
  const choices: readonly SelectOption<V | "skip">[] = [
    ...options,
    { value: "skip", label: skipLabel },
  ];
  return (
    <section className="flex flex-col gap-3">
      <div>
        <Eyebrow>{title}</Eyebrow>
        {description && <p className="mt-1 text-xs text-muted">{description}</p>}
      </div>
      {/* Value and count share a row with the select from sm up; on a phone
       * the select drops to its own full-width row underneath. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(11rem,auto)]">
        {values.map(({ value, count }) => (
          <div key={value} className="contents">
            <span className="text-sm wrap-break-word">{value}</span>
            <span className="text-xs text-muted tabular-nums">{formatCount(count, "row")}</span>
            <OptionSelect
              ariaLabel={`Map “${value}”`}
              value={mapping[value] ?? "skip"}
              onChange={(chosen) => onChange({ ...mapping, [value]: chosen })}
              options={choices}
              className="col-span-2 mb-2 sm:col-span-1 sm:mb-0"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export const ASCENT_STYLE_OPTIONS = ASCENT_STYLES.map((value) => ({
  value,
  label: ASCENT_STYLE_LABELS[value],
}));
export const CLIMB_TYPE_OPTIONS = [
  ...CLIMB_TYPES.map((value) => ({
    value,
    label: DISCIPLINE_LABELS[value],
  })),
  { value: "route" as const, label: "Route (sport or trad)" },
];
export const GRADE_FEEL_OPTIONS = GRADE_FEEL_VALUES.map((value) => ({
  value,
  label: GRADE_FEEL_LABELS[value],
}));
