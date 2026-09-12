"use client";

import { Button } from "@heroui/react";
import { RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { generateCatalogExport } from "@/actions";
import { InlineAlert } from "@/components/ui/inline-alert";

/** Admin-only control on /account that runs the weekly catalog export now.
 * The action's refresh() re-renders the surrounding server row, so the new
 * timestamp shows up without any client state beyond the pending flag. */
export function CatalogExportGenerateButton() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function handlePress() {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await generateCatalogExport();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" className="gap-2" onPress={handlePress} isDisabled={pending}>
        <RefreshCw aria-hidden="true" className="size-4" />
        {pending ? "Generating…" : "Generate now"}
      </Button>
      {error && <InlineAlert>{error}</InlineAlert>}
      {done && !error && <InlineAlert status="success">Snapshot updated.</InlineAlert>}
    </div>
  );
}
