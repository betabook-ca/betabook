import type { ReactNode } from "react";

/** The list every page of sends is drawn as. Its children are the `li`s. */
export function SendRows({ children }: { children: ReactNode }) {
  return (
    <ul role="list" className="flex flex-col divide-y divide-separator">
      {children}
    </ul>
  );
}
