import type { ReactNode } from "react";

/** List wrapper for send rows. Children are the `li` elements. */
export function SendRows({ children }: { children: ReactNode }) {
  return (
    <ul role="list" className="flex flex-col divide-y divide-separator">
      {children}
    </ul>
  );
}
