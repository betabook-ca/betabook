import type { Metadata } from "next";

import { ImportLandingPage } from "@/components/import-landing-page";
import { IMPORT_PAGES } from "@/lib/landing-pages";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Import your Mountain Project ticks",
  description:
    "Import your Mountain Project ticks into Betabook from their CSV export. Betabook maps the grade, style and location columns.",
  path: IMPORT_PAGES.mountainProject.path,
});

export default function MountainProjectImportPage() {
  return <ImportLandingPage source="mountainProject" />;
}
