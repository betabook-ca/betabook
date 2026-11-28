import { useEffect, useEffectEvent } from "react";

/** Tells the dialog around a form when its save starts and settles, so the
 * dialog can refuse to close mid-save (ResponsiveDialog's `isPending`). */
export function useReportPending(
  pending: boolean,
  onPendingChange: ((pending: boolean) => void) | undefined,
) {
  const report = useEffectEvent((value: boolean) => onPendingChange?.(value));
  useEffect(() => {
    report(pending);
  }, [pending]);
}
