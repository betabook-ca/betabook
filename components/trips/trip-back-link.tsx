import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";

export function TripBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <AppLink href={href} className="flex min-h-6 w-fit items-center gap-1 text-sm text-muted">
      <ArrowLeft aria-hidden className="size-4" />
      {children}
    </AppLink>
  );
}
