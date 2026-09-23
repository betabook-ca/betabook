export const SUPPORT_EMAIL = "support@betabook.ca";

export function importTooLargeMessage(history: string): string {
  return `This ${history} is too large for a direct import. Email ${SUPPORT_EMAIL} for help importing it.`;
}
