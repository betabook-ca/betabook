/** Verified against KAYA: request and stream up to 100 ascents per page. */
export const KAYA_PAGE_SIZE = 100;

export const KAYA_MAX_RETRIES = 3;

export type KayaRetry = {
  attempt: number;
  retryAt: number;
  reason: "rate-limit" | "unavailable";
};

export type KayaStreamEvent =
  | { type: "profile"; username: string }
  | { type: "page"; items: unknown[]; total: number }
  | ({ type: "retry"; delayMs: number } & Omit<KayaRetry, "retryAt">)
  | { type: "complete"; total: number }
  | { type: "heartbeat" }
  | { type: "error"; error: string };

export type KayaImportProgress = {
  discipline: "boulder" | "route";
  loaded: number;
  total: number | null;
  retry: KayaRetry | null;
};
