import type { ApiResponse } from "@/spa/lib/api";

export type ClimbPageData = Pick<
  ApiResponse<"/api/public/climbs/{id}">,
  "climb" | "area" | "ancestors" | "publicSends" | "videos"
> & { climbId: number };

export type SearchBootstrapData = { climbsPage: ApiResponse<"/api/public/search/climbs"> };
export type AuthConfig = ApiResponse<"/api/config/auth">;

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  transport: typeof fetch = fetch,
  errorMessage?: string,
): Promise<T> {
  const response = await transport(url, {
    credentials: "same-origin",
    ...init,
  });
  if (response.ok) {
    return response.status === 204 ? (null as T) : response.json<T>();
  }
  const payload = await response.json<{ error?: string; message?: string }>().catch(() => null);
  const err = new Error(
    errorMessage ?? payload?.message ?? payload?.error ?? `Request failed (${response.status})`,
  );
  (err as Error & { status?: number }).status = response.status;
  throw err;
}

export function isNotFoundError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { status?: number }).status === 404;
}

export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { status?: number }).status === 401;
}

export function parsePositiveId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string") {
    return null;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}
