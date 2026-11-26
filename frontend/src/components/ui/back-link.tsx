import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";

/** A small muted "← All trips" link above a detail page's header, back to
 * the index or the page it belongs to. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <AppLink href={href} className="flex min-h-6 w-fit items-center gap-1 text-sm text-muted">
      <ArrowLeft aria-hidden className="size-4" />
      {children}
    </AppLink>
  );
}
