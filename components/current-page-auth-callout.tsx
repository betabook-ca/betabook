"use client";

import { AuthCallout } from "@/components/auth-callout";
import { usePathname, useSearchParams } from "@/spa/lib/navigation";

export function CurrentPageAuthCallout() {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  return <AuthCallout next={`${pathname}${query ? `?${query}` : ""}`} />;
}
