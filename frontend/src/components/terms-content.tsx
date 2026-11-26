import type { ComponentType } from "react";

import { Terms20260909 } from "@/components/terms/versions/2026-09-09";
import { TERMS_VERSION, type TermsVersion } from "@/lib/terms";

// Type checking requires a document for every published version in the registry.
const documents = { "2026-09-09": Terms20260909 } satisfies Record<TermsVersion, ComponentType>;

export function TermsContent({ version = TERMS_VERSION }: { version?: TermsVersion }) {
  const Document = documents[version];
  return <Document />;
}
