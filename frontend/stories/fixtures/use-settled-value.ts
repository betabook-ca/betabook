import { useEffect, useState } from "react";

/** `value` once it has stayed unchanged for `ms`: the gallery demos' stand-in
 * for a debounced request. Compare it with `value` to show a pending state;
 * `settleNow` skips the wait, as a retry would. */
export function useSettledValue<T>(value: T, ms: number): [settled: T, settleNow: () => void] {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return [settled, () => setSettled(value)];
}
