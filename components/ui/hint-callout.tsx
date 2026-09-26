import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { cardClass } from "@/components/ui/card";

/** A neutral hint beside a control — what to expect, where to find an ID.
 * Not live feedback about an operation; that is InlineAlert. */
export function HintCallout({ children }: { children: ReactNode }) {
  return (
    <div
      role="note"
      className={`flex items-start gap-2 text-xs text-muted ${cardClass("sm", "inset")}`}
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}
