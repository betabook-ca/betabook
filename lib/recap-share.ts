import type { SocialCardStats } from "@/lib/social-card";

const RECAP_TOKEN = /^[A-Za-z0-9_-]{22}$/;
export const RECAP_IMAGE_SIZE = { width: 1080, height: 1350 } as const;

/** Only the facts deliberately displayed in the linked recap are stored. */
export type RecapSnapshot = {
  version: 1;
  createdAt: string;
  owner: { name: string; initials: string };
  stats: SocialCardStats;
};

export function parseRecapToken(value: unknown): string | null {
  return typeof value === "string" && RECAP_TOKEN.test(value) ? value : null;
}

export function newRecapToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function recapSharePath(token: string): string {
  if (!parseRecapToken(token)) throw new Error("Invalid recap token");
  return `/r/${token}`;
}

export function recapCoverImagePath(token: string): string {
  return `/api/og/recap/${token}`;
}
