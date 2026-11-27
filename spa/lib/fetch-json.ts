import type { ClimbType } from "@/lib/grades";

type PublicArea = {
  id: number;
  name: string;
  parentId: number | null;
};

export type PublicAreaDetails = PublicArea & {
  description: string | null;
};

export type PublicAreaResult = PublicAreaDetails & {
  ancestorPath: string | null;
};

export type PublicClimb = {
  id: number;
  name: string;
  areaId: number;
  areaName: string;
  type: ClimbType;
  grade: number | null;
  description: string | null;
  brokenOn: string | null;
  avgRating: number | null;
  sendCount: number;
};

export type PublicClimbSend = {
  userName: string | null;
  userImage: string | null;
  dateSent: string | null;
  ascentStyle: string;
  rating: number | null;
  suggestedGrade: number | null;
  gradeFeel: string;
  comment: string | null;
  videos: string[] | null;
};

export type AuthSession = {
  session: {
    id: string;
    userId: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
    role: string | null;
  };
} | null;

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
