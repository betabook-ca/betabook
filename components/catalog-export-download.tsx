import { buttonVariants } from "@heroui/react";
import { Download } from "lucide-react";

import { SettingsRow } from "@/components/ui/settings";
import type { CatalogExportInfo } from "@/lib/catalog-export";
import { formatCount } from "@/lib/format";
import { formatDate } from "@/lib/format-date";

/** The /account row for the weekly catalog snapshot. A plain anchor with
 * `download` rather than AppLink: the target is a route handler that returns
 * an attachment, and a client-side navigation to it would fail. */
export function CatalogExportDownload({ info }: { info: CatalogExportInfo | null }) {
  return (
    <SettingsRow
      title="Areas and climbs"
      description={
        info
          ? `One JSON file. Updated ${formatDate(info.generatedAt)} · ${formatCount(info.areaCount, "area")} · ${formatCount(info.climbCount, "climb")}.`
          : "One JSON file, refreshed weekly. The first snapshot runs on Monday."
      }
    >
      {info && (
        <a
          href="/api/catalog/export"
          download
          className={`${buttonVariants({ variant: "outline" })} gap-2 text-foreground`}
        >
          <Download aria-hidden="true" className="size-4" />
          Download catalog
        </a>
      )}
    </SettingsRow>
  );
}
