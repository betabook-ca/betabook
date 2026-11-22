"use client";

import { clsx } from "clsx";
import { Upload } from "lucide-react";
import { useState } from "react";
import { Button, DropZone, FileTrigger, isFileDropItem } from "react-aria-components";

import { OptionSelect } from "@/components/ui/option-select";
import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, type ParsedCsv } from "@/lib/sends-import";

import { KayaImportForm } from "./kaya-import-form";
import { MountainProjectImportForm } from "./mountain-project-import-form";
import { SendageImportForm } from "./sendage-import-form";

const SOURCES = [
  { value: "sendage", label: "Sendage" },
  { value: "kaya", label: "KAYA" },
  { value: "mountainproject", label: "Mountain Project" },
  { value: "csv", label: "CSV file" },
] as const;
type Source = (typeof SOURCES)[number]["value"];
export type DirectSource = Exclude<Source, "csv">;

export function ImportSourceStep({
  initialSource = "sendage",
  reading = false,
  disabled = false,
  onFile,
  onLoaded,
}: {
  initialSource?: Source;
  reading?: boolean;
  /** Disable import transport while keeping source selection available in previews. */
  disabled?: boolean;
  onFile: (file: File) => void;
  onLoaded: (parsed: ParsedCsv, source: DirectSource, label: string) => void;
}) {
  const [source, setSource] = useState<Source>(initialSource);
  const [busy, setBusy] = useState(false);
  const locked = busy || reading;
  const fileDisabled = locked || disabled;

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Import from</legend>
        {/* Four labels outgrow a phone-width card as a button row, so the
         * same choice is a select below md. */}
        <OptionSelect
          ariaLabel="Import from"
          value={source}
          onChange={setSource}
          options={SOURCES}
          isDisabled={locked}
          className="md:hidden"
        />
        <SegmentedButtons
          value={source}
          onChange={setSource}
          options={SOURCES}
          isDisabled={locked}
          className="hidden md:flex"
        />
      </fieldset>
      {source === "sendage" && (
        <SendageImportForm
          disabled={reading || disabled}
          onBusyChange={setBusy}
          onLoaded={(parsed, username) => onLoaded(parsed, "sendage", username)}
        />
      )}
      {source === "kaya" && (
        <KayaImportForm
          disabled={reading || disabled}
          onBusyChange={setBusy}
          onChooseCsv={() => setSource("csv")}
          onLoaded={(parsed, username) => onLoaded(parsed, "kaya", username)}
        />
      )}
      {source === "mountainproject" && (
        <MountainProjectImportForm
          disabled={reading || disabled}
          onBusyChange={setBusy}
          onLoaded={(parsed, label) => onLoaded(parsed, "mountainproject", label)}
        />
      )}
      {source === "csv" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Upload an export from Mountain Project, KAYA, Sendage, or Betabook.
          </p>
          {/* The whole card is the file chooser. DropZone adds its own hidden
           * drop target, so a file can also be pasted from the keyboard. */}
          <DropZone
            isDisabled={fileDisabled}
            aria-label="Drop a CSV file"
            onDrop={(event) => {
              const item = event.items.find(isFileDropItem);
              if (item) void item.getFile().then(onFile);
            }}
            className={({ isDropTarget }) =>
              clsx(
                "rounded-panel border border-dashed transition-colors has-focus-visible:status-focused",
                isDropTarget ? "border-accent bg-surface" : "border-border hover:bg-surface/60",
              )
            }
          >
            <FileTrigger
              acceptedFileTypes={[".csv", "text/csv"]}
              onSelect={(files) => {
                const file = files?.[0];
                if (file) onFile(file);
              }}
            >
              <Button
                isDisabled={fileDisabled}
                aria-label="Choose a CSV file"
                className="flex w-full cursor-pointer flex-col items-center gap-3 px-5 py-8 text-center outline-none"
              >
                <Upload className="size-5 text-muted" aria-hidden />
                <span className="text-sm font-medium">
                  {reading ? "Reading file…" : "Drop your CSV here or choose a file"}
                </span>
                <span className="text-xs text-muted">
                  Up to {MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB ·{" "}
                  {MAX_IMPORT_ROWS.toLocaleString("en-US")} rows
                </span>
              </Button>
            </FileTrigger>
          </DropZone>
          <p className="text-xs text-muted">
            Columns are mapped automatically. You’ll review climb matches before saving.
          </p>
        </div>
      )}
    </div>
  );
}
