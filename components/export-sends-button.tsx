"use client";

import { Button } from "@heroui/react";
import { Download } from "lucide-react";
import { useState } from "react";

import { InlineAlert } from "@/components/ui/inline-alert";
import type { UserSendRow } from "@/db/queries";
import { apiFetch } from "@/lib/api-client";
import { downloadCsv } from "@/lib/download";
import { formatCount } from "@/lib/format";
import { buildSendsExportCsv } from "@/lib/sends-export";

type UserSendsPageResponse = {
  sends: UserSendRow[];
  nextCursor: { dateSent: string | null; id: number } | null;
};

/** Exports the signed-in user's full send history as a CSV, walked in keyset
 * pages from /api/users/[id]/sends/export rather than pulled into one
 * unbounded server-action response.
 *
 * That route exists separately from the profile list's because the two want
 * opposite things from pagination: the list keeps a defensive OFFSET cap,
 * which an export would silently truncate at. Keyset cursors have no such
 * ceiling, so the loop below is bounded only by the history itself — hence
 * the running row count, and the id set that stops a cursor that fails to
 * advance from looping forever. The CSV is assembled client-side. */
export function ExportSendsButton({ userId }: { userId: string }) {
  const [exportedRows, setExportedRows] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exporting = exportedRows !== null;

  async function handlePress() {
    setError(null);
    setExportedRows(0);
    try {
      const rows: UserSendRow[] = [];
      const seenIds = new Set<number>();
      let cursor: UserSendsPageResponse["nextCursor"] = null;
      do {
        const params = new URLSearchParams();
        if (cursor) {
          params.set("afterId", String(cursor.id));
          params.set("afterDate", cursor.dateSent ?? "null");
        }
        const query = params.size > 0 ? `?${params.toString()}` : "";
        const res = await apiFetch(`/api/users/${userId}/sends/export${query}`);
        if (!res.ok) throw new Error(`Exporting sends failed: ${res.status}`);
        const data: UserSendsPageResponse = await res.json();
        if (data.sends.some((send) => seenIds.has(send.id))) {
          throw new Error("Export cursor did not advance");
        }
        for (const send of data.sends) seenIds.add(send.id);
        rows.push(...data.sends);
        if (data.nextCursor && data.sends.length === 0) {
          throw new Error("Export cursor did not advance");
        }
        cursor = data.nextCursor;
        setExportedRows(rows.length);
      } while (cursor);

      downloadCsv(
        buildSendsExportCsv(rows),
        `betabook-sends-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch {
      setError("Couldn't export your sends. Try again.");
    } finally {
      setExportedRows(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" className="gap-2" onPress={handlePress} isDisabled={exporting}>
        <Download className="size-4" />
        {exporting ? `Exporting… ${formatCount(exportedRows, "row")}` : "Export sends"}
      </Button>
      {error && <InlineAlert>{error}</InlineAlert>}
    </div>
  );
}
