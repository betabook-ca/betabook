import type { Metadata } from "next";

import { ImportLandingPage } from "@/components/import-landing-page";
import { IMPORT_PAGES } from "@/lib/landing-pages";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Import your Sendage sends",
  description:
    "Import onsights, flashes and redpoints into Betabook from a public Sendage profile or Sendage’s CSV export.",
  path: IMPORT_PAGES.sendage.path,
});

export default function SendageImportPage() {
  return <ImportLandingPage source="sendage" />;
}
