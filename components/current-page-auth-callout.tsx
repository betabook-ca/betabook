"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { AuthCallout } from "@/components/auth-callout";

export function CurrentPageAuthCallout() {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  return <AuthCallout next={`${pathname}${query ? `?${query}` : ""}`} />;
}
