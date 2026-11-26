import type { ClimbVideos } from "@/db/queries";
import type {
  PublicAreaDetails,
  PublicClimb,
  PublicClimbSend,
  PublicClimbsPage,
} from "@/lib/public-catalog";

export type ClimbPageData = {
  climbId: number;
  climb: PublicClimb;
  area: PublicAreaDetails | null;
  ancestors: PublicAreaDetails[];
  publicSends: PublicClimbSend[];
  videos: ClimbVideos;
};

export type SearchBootstrapData = {
  climbsPage: PublicClimbsPage;
};

export type AuthConfig = {
  googleEnabled: boolean;
  turnstileSiteKey: string | null;
};

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  transport: typeof fetch = fetch,
): Promise<T> {
  const response = await transport(url, {
    credentials: "same-origin",
    ...init,
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T & { error?: string; message?: string }) : null;
  if (!response.ok) {
    const err = new Error(
      payload?.message ?? payload?.error ?? `Request failed (${response.status})`,
    );
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }
  return payload as T;
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
