import { Description, FieldError } from "@heroui/react";
import { clsx } from "clsx";
import type { ReactNode } from "react";

export type FieldUsage = { used: number; limit: number; unit: string };

/** Keep the field's own Label inside this header to preserve its association. */
export function FieldHeader({ children, usage }: { children: ReactNode; usage?: FieldUsage }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex min-w-0 items-center gap-1">{children}</div>
      {usage && (
        <span
          className={clsx(
            "ml-auto shrink-0 text-xs tabular-nums",
            usage.used > usage.limit ? "text-danger" : "text-muted",
          )}
          role="status"
          aria-live={usage.unit === "characters" ? "off" : "polite"}
          aria-label={`${usage.used} of ${usage.limit} ${usage.unit}`}
        >
          {usage.used.toLocaleString("en-US")}/{usage.limit.toLocaleString("en-US")} {usage.unit}
        </span>
      )}
    </div>
  );
}

/** Use inside HeroUI fields; errors replace help and retain field descriptions. */
export function FieldFeedback({
  helper,
  error,
  className,
}: {
  helper?: ReactNode;
  error?: string | null;
  className?: string;
}) {
  if (error)
    return (
      <FieldError className={clsx("px-0 text-sm", className)}>
        <span role="alert">{error}</span>
      </FieldError>
    );
  return helper ? <Description className={className}>{helper}</Description> : null;
}
