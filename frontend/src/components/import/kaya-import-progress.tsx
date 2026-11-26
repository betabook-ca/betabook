"use client";

import { useEffect, useState } from "react";

import { ProgressBar } from "@/components/ui/progress-bar";
import {
  KAYA_MAX_RETRIES,
  type KayaImportProgress as ImportProgress,
} from "@/lib/kaya-import-stream";

export function KayaImportProgress({ progress }: { progress: ImportProgress }) {
  const [now, setNow] = useState(() => Date.now());
  const retryAt = progress.retry?.retryAt;
  useEffect(() => {
    if (retryAt === undefined) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 1_000);
    return () => clearInterval(interval);
  }, [retryAt]);
  const discipline = progress.discipline === "boulder" ? "boulders" : "routes";
  const seconds = retryAt === undefined ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1_000));
  return (
    <div className="flex flex-col gap-2">
      <p role="status" aria-atomic="true" className="text-sm text-muted">
        {progress.total === null
          ? `Loading outdoor ${discipline}…`
          : `${progress.loaded.toLocaleString("en-US")} of ${progress.total.toLocaleString("en-US")} ${discipline} loaded`}
        {progress.retry && (
          <span className="mt-1 block">
            {progress.retry.reason === "rate-limit"
              ? "KAYA asked us to slow down."
              : "KAYA is temporarily unavailable."}{" "}
            Attempt {progress.retry.attempt}/{KAYA_MAX_RETRIES}.{seconds === 0 && " Trying again…"}
          </span>
        )}
      </p>
      {/* Outside the live region: a per-second countdown would be re-announced every tick. */}
      {progress.retry && seconds > 0 && (
        <p className="text-sm text-muted">Retrying in {seconds}s</p>
      )}
      {progress.total !== null && progress.total > 0 && (
        <ProgressBar
          value={progress.loaded}
          max={progress.total}
          label={`Loading KAYA ${discipline}`}
        />
      )}
      <p className="text-xs text-muted">
        Large histories can take a few seconds. Keep this page open; you can cancel anytime.
      </p>
    </div>
  );
}
