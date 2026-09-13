/** The thin progress track the import wizard shows while a long job runs. */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="h-2 w-full overflow-hidden rounded-full bg-surface"
    >
      <div className="h-full bg-accent transition-all" style={{ width: `${percentage}%` }} />
    </div>
  );
}
