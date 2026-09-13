"use client";

import { clsx } from "clsx";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";

import { SegmentedButtons } from "@/components/ui/segmented-buttons";
import type { ParsedCsv } from "@/lib/sends-import";

import { KayaImportForm } from "./kaya-import-form";
import { SendageImportForm } from "./sendage-import-form";

const SOURCES = [
  { value: "sendage", label: "Sendage" },
  { value: "kaya", label: "KAYA" },
  { value: "csv", label: "CSV file" },
] as const;
type Source = (typeof SOURCES)[number]["value"];

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
  onLoaded: (parsed: ParsedCsv, source: "sendage" | "kaya", username: string) => void;
}) {
  const [source, setSource] = useState<Source>(initialSource);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const locked = busy || reading;
  const fileDisabled = locked || disabled;

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Import from</legend>
        <SegmentedButtons
          value={source}
          onChange={setSource}
          options={SOURCES}
          isDisabled={locked}
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
      {source === "csv" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Upload an export from Mountain Project, KAYA, Sendage, or Betabook.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            disabled={fileDisabled}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file && !fileDisabled) onFile(file);
            }}
          />
          <div
            role="button"
            tabIndex={fileDisabled ? -1 : 0}
            aria-disabled={fileDisabled}
            aria-label="Choose a CSV file"
            onClick={() => {
              if (!fileDisabled) fileInput.current?.click();
            }}
            onKeyDown={(event) => {
              if (!fileDisabled && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                fileInput.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (!fileDisabled) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file && !fileDisabled) onFile(file);
            }}
            className={clsx(
              "flex cursor-pointer flex-col items-center gap-3 rounded-panel border border-dashed px-5 py-8 text-center transition-colors focus-visible:status-focused",
              dragging ? "border-accent bg-surface" : "border-border hover:bg-surface/60",
            )}
          >
            <Upload className="size-5 text-muted" aria-hidden />
            <p className="text-sm font-medium">
              {reading ? "Reading file…" : "Drop your CSV here or choose a file"}
            </p>
            <p className="text-xs text-muted">Up to 10 MB · 50,000 rows</p>
          </div>
          <p className="text-xs text-muted">
            Columns are mapped automatically. You’ll review climb matches before saving.
          </p>
        </div>
      )}
    </div>
  );
}
