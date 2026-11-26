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
  // Clamped once so assistive tech hears what the fill shows.
  const clamped = Math.min(Math.max(0, max), Math.max(0, value));
  const percentage = max > 0 ? (clamped / max) * 100 : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={max}
      className={`w-full overflow-hidden rounded-full bg-surface ${size === "sm" ? "h-1 dark:bg-white" : "h-2"}`}
    >
      <div className="h-full bg-accent transition-all" style={{ width: `${percentage}%` }} />
    </div>
  );
}
