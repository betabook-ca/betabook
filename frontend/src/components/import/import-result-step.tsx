import { Button } from "@heroui/react";

import { AppLink } from "@/components/ui/app-link";
import { InlineAlert } from "@/components/ui/inline-alert";

import { TEXT_BUTTON_CLASS } from "./text-button";
import { Stat } from "./value-mapping-section";

const MAX_LISTED_FAILURES = 50;

export function ImportResultStep({
  result,
  failures,
  profileHref,
  onDownload,
  onRestart,
}: {
  result: {
    imported: number;
    overwritten: number;
    alreadyLogged: number;
    duplicates: number;
    stopped: { message: string } | null;
  };
  failures: readonly { rowIndex: number; label: string | null; reason: string }[];
  profileHref: string;
  onDownload: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {result.stopped && (
        <InlineAlert>
          {result.stopped.message} Rows imported before it stopped were kept.
        </InlineAlert>
      )}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Imported" value={result.imported} />
        {result.overwritten > 0 && <Stat label="Replaced" value={result.overwritten} />}
        <Stat label="Already logged" value={result.alreadyLogged} />
        {result.duplicates > 0 && <Stat label="Duplicates skipped" value={result.duplicates} />}
        <Stat
          label="Needs attention"
          value={failures.length}
          tone={failures.length > 0 ? "warning" : undefined}
        />
      </div>
      {failures.length > 0 && (
        <details>
          <summary className={`text-sm text-muted ${TEXT_BUTTON_CLASS}`}>
            View rows needing attention
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted">
            {failures.slice(0, MAX_LISTED_FAILURES).map((item) => (
              <li key={`${item.rowIndex}-${item.reason}`}>
                Row {item.rowIndex + 1}
                {item.label ? ` (${item.label})` : ""}: {item.reason}
              </li>
            ))}
            {failures.length > MAX_LISTED_FAILURES && (
              <li>
                …and {failures.length - MAX_LISTED_FAILURES} more. Download the CSV below for the
                full list.
              </li>
            )}
          </ul>
        </details>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {result.imported + result.overwritten > 0 && (
          <AppLink href={profileHref} className="text-sm">
            See your sends
          </AppLink>
        )}
        {failures.length > 0 && (
          <Button variant="ghost" onPress={onDownload}>
            Download rows needing attention (CSV)
          </Button>
        )}
        <Button onPress={onRestart}>Import another file</Button>
      </div>
    </div>
  );
}
