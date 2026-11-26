import type { AreaBreadcrumbs, ClimbSendStats, ClimbVideos, ClimbWithAreaName } from "@/db/queries";
import type {
  PublicArea,
  PublicAreaDetails,
  PublicClimb,
  PublicClimbSend,
  PublicClimbsPage,
} from "@/lib/public-catalog";

export type AreaPageData = {
  areaId: number;
  query: string;
  area: PublicAreaDetails;
  ancestors: PublicAreaDetails[];
  subareas: PublicArea[];
  climbsPage: PublicClimbsPage;
  memberClimbsPage?: {
    climbs: ClimbWithAreaName[];
    hasNextPage: boolean;
    sendStats: Record<number, ClimbSendStats>;
    areaBreadcrumbs: AreaBreadcrumbs;
    sentClimbIds: number[];
  };
};

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

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T & { error?: string; message?: string }) : null;
  if (!response.ok) {
    throw new Error(payload?.message ?? payload?.error ?? `Request failed (${response.status})`);
  }
  return payload as T;
}

export function parsePositiveId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string") {
    return null;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}
