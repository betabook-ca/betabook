import { apiFetch } from "@/lib/api-client";
import { parseMountainProjectUserId } from "@/lib/mountain-project-profile";
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  MP_ASCENT_COLUMN,
  deriveSourceColumns,
  detectImportSource,
  distinctValues,
  guessAscentStyleMapping,
  parseCsvText,
  type ParsedCsv,
} from "@/lib/sends-import";
import { SUPPORT_EMAIL } from "@/lib/support";

const FORMAT_ERROR = `Mountain Project returned an unfamiliar tick export. Download it as a CSV and upload that file instead, or email ${SUPPORT_EMAIL}.`;
const SIZE_ERROR = `This Mountain Project tick list is too large for a direct import. Email ${SUPPORT_EMAIL} for help importing it.`;

async function responseError(response: Response) {
  let message: unknown;
  try {
    const result: unknown = await response.json();
    message = result && typeof result === "object" && "error" in result ? result.error : null;
  } catch {
    message = null;
  }
  return new Error(
    typeof message === "string" && message
      ? message
      : "Couldn't load ticks from Mountain Project. Please try again.",
  );
}

async function readCsv(
  response: Response,
  signal: AbortSignal,
  onProgress?: (bytes: number) => void,
): Promise<string> {
  if (!response.body || !response.headers.get("Content-Type")?.toLowerCase().startsWith("text/csv"))
    throw new Error(FORMAT_ERROR);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let csv = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_IMPORT_FILE_BYTES) throw new Error(SIZE_ERROR);
      csv += decoder.decode(value, { stream: true });
      onProgress?.(bytes);
    }
    csv += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  return csv;
}

const STYLE_EXAMPLE_LIMIT = 4;

/** A recognized export skips the mapping step, so name the styles it will drop. */
function styleWarnings(parsed: ParsedCsv): string[] {
  const values = distinctValues(parsed.rows, MP_ASCENT_COLUMN);
  const mapping = guessAscentStyleMapping(values);
  const skipped = values.filter((value) => mapping[value] === "skip");
  if (!skipped.length) return [];
  const shown = skipped.slice(0, STYLE_EXAMPLE_LIMIT).map((value) => `“${value}”`);
  const more = skipped.length - shown.length;
  return [
    `Mountain Project records attempts and rope styles alongside sends. ${shown.join(", ")}${more ? ` and ${more} more` : ""} ${skipped.length === 1 ? "is not a Betabook ascent style" : "are not Betabook ascent styles"}, so those ticks are skipped unless you map them in the ascent style step.`,
  ];
}

/** Proxied: Mountain Project serves the export without CORS headers. */
export async function fetchMountainProjectImport(
  input: string,
  { signal, onProgress }: { signal: AbortSignal; onProgress?: (bytes: number) => void },
): Promise<{ username: string; displayName: string; parsed: ParsedCsv }> {
  const userId = parseMountainProjectUserId(input);
  signal.throwIfAborted();
  let response: Response;
  try {
    response = await apiFetch(`/api/import/mountain-project?userId=${userId}`, {
      signal,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof TypeError)
      throw new Error("The Mountain Project download was interrupted. Please try again.", {
        cause: error,
      });
    throw error;
  }
  if (!response.ok) throw await responseError(response);
  const username = response.headers.get("X-Mountain-Project-User") ?? "";
  const csv = await readCsv(response, signal, onProgress);
  signal.throwIfAborted();
  const csvRows = parseCsvText(csv);
  if (detectImportSource(csvRows.headers) !== "mountainproject") throw new Error(FORMAT_ERROR);
  if (csvRows.rows.length > MAX_IMPORT_ROWS) throw new Error(SIZE_ERROR);
  const parsed = deriveSourceColumns(csvRows, "mountainproject");
  return {
    username: userId,
    displayName: username ? `@${username}` : `user ${userId}`,
    parsed: { ...parsed, warnings: [...parsed.warnings, ...styleWarnings(parsed)] },
  };
}
