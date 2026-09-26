export const SUPPORT_EMAIL = "support@betabook.ca";

/** Self-serve route first; support is the last resort. */
export function importCsvFallback(service: string, exportNoun: string): string {
  return `Export your ${exportNoun} from ${service} as a CSV and upload that file instead, or email ${SUPPORT_EMAIL}.`;
}

export function importTooLargeMessage(
  history: string,
  fallback = `Email ${SUPPORT_EMAIL} for help importing it.`,
): string {
  return `This ${history} is too large for a direct import. ${fallback}`;
}
