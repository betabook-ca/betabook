import type { Metadata } from "next";

import { ImportLandingPage } from "@/components/import-landing-page";
import { IMPORT_PAGES } from "@/lib/landing-pages";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Import your KAYA logbook",
  description:
    "Import outdoor boulders and routes into Betabook from a public KAYA profile or KAYA’s CSV export.",
  path: IMPORT_PAGES.kaya.path,
});

export default function KayaImportPage() {
  return <ImportLandingPage source="kaya" />;
}
