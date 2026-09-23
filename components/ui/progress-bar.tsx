/** `sm` is the inline track beside a count; its dark track is lightened so it
 * still reads against a row. */
export function ProgressBar({
  value,
  max,
  label,
  size = "md",
}: {
  value: number;
  max: number;
  label: string;
  size?: "sm" | "md";
}) {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={`w-full overflow-hidden rounded-full bg-surface ${size === "sm" ? "h-1 dark:bg-white" : "h-2"}`}
    >
      <div className="h-full bg-accent transition-all" style={{ width: `${percentage}%` }} />
    </div>
  );
}
