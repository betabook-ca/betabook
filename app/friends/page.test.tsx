import { expect, it, vi } from "vitest";

import FriendsPage from "@/app/friends/page";
import type { UrlParamsRecord } from "@/lib/url-params";

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
}));
vi.mock("@/lib/session", () => ({ getMemberSession: async () => null }));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next/image", () => ({ default: () => null }));

it.each([
  [{ view: "requests" }, "/sign-in?next=%2Ffriends%3Fview%3Drequests"],
  [{}, "/sign-in?next=%2Ffriends"],
  [{ view: "https://example.com" }, "/sign-in?next=%2Ffriends"],
] satisfies [UrlParamsRecord, string][])(
  "preserves the Requests email destination through sign-in for %j",
  async (params, destination) => {
    expect(await FriendsPage({ searchParams: Promise.resolve(params) })).toMatchObject({
      props: { next: decodeURIComponent(destination.split("next=")[1]) },
    });
  },
);
