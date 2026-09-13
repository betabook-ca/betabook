import { beforeEach, describe, expect, it, vi } from "vitest";

import TutorialPage from "@/app/tutorial/[tourId]/[stepId]/page";
import TutorialLayout, { metadata } from "@/app/tutorial/[tourId]/layout";
import TutorialStart from "@/app/tutorial/[tourId]/page";
import { getDb } from "@/db/client";
import { getProductTourState } from "@/db/queries";
import { getMemberSession as getSession } from "@/lib/session";

vi.mock("next/link", () => ({ default: () => null }));
vi.mock("@/lib/session", () => ({ getMemberSession: vi.fn<typeof getSession>() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn<typeof getDb>() }));
vi.mock("@/db/queries", () => ({ getProductTourState: vi.fn<typeof getProductTourState>() }));
vi.mock("@/components/product-tours/tour-experience", () => ({ TourExperience: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (href: string) => {
    throw new Error(`REDIRECT:${href}`);
  },
}));

beforeEach(() => vi.resetAllMocks());

describe("tutorial routes", () => {
  it("requires sign-in and keeps demo routes out of search results", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect(
      await TutorialLayout({
        params: Promise.resolve({ tourId: "journal" }),
        children: "page auth gate",
      }),
    ).toBe("page auth gate");
    await expect(
      TutorialPage({
        params: Promise.resolve({ tourId: "journal", stepId: "sends" }),
        searchParams: Promise.resolve({ from: "account" }),
      }),
    ).resolves.toMatchObject({ props: { next: "/tutorial/journal/sends?from=account" } });
    expect(metadata.robots).toEqual({ index: false });
  });

  it("uses the authenticated account for completion and exit", async () => {
    vi.mocked(getProductTourState).mockResolvedValue({
      returning: false,
      progress: [{ tourId: "journal", version: 1, status: "completed" }],
    });
    vi.mocked(getSession).mockResolvedValue({ user: { id: "signed-in-owner" } } as Awaited<
      ReturnType<typeof getSession>
    >);
    const layout = await TutorialLayout({
      params: Promise.resolve({ tourId: "journal" }),
      children: null,
    });
    expect(getProductTourState).toHaveBeenCalledWith(undefined, "signed-in-owner");
    expect(layout).toMatchObject({ props: { userId: "signed-in-owner", savedVersion: 1 } });
  });

  it("rejects unknown tours and steps while allowing direct links", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "owner" } } as Awaited<
      ReturnType<typeof getSession>
    >);
    await expect(
      TutorialLayout({ params: Promise.resolve({ tourId: "missing" }), children: null }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      TutorialPage({
        params: Promise.resolve({ tourId: "journal", stepId: "missing" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      TutorialPage({
        params: Promise.resolve({ tourId: "journal", stepId: "sends" }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toBeNull();
  });
  it("preserves Account replay when entering through the tour root", async () => {
    vi.mocked(getSession).mockResolvedValue({ user: { id: "owner" } } as Awaited<
      ReturnType<typeof getSession>
    >);
    await expect(
      TutorialStart({
        params: Promise.resolve({ tourId: "journal" }),
        searchParams: Promise.resolve({ from: "account" }),
      }),
    ).rejects.toThrow("REDIRECT:/tutorial/journal/journal?from=account");
  });

  it("does not carry arbitrary return destinations into sign-in", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(
      TutorialPage({
        params: Promise.resolve({ tourId: "journal", stepId: "account" }),
        searchParams: Promise.resolve({ from: "https://example.com" }),
      }),
    ).resolves.toMatchObject({ props: { next: "/tutorial/journal/account" } });
  });

  it("preserves the update selection through sign-in and root redirects", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(
      TutorialPage({
        params: Promise.resolve({ tourId: "journal", stepId: "sends" }),
        searchParams: Promise.resolve({ mode: "updates" }),
      }),
    ).resolves.toMatchObject({ props: { next: "/tutorial/journal/sends?mode=updates" } });
    vi.mocked(getSession).mockResolvedValue({ user: { id: "owner" } } as Awaited<
      ReturnType<typeof getSession>
    >);
    await expect(
      TutorialStart({
        params: Promise.resolve({ tourId: "journal" }),
        searchParams: Promise.resolve({ mode: "updates" }),
      }),
    ).rejects.toThrow("REDIRECT:/tutorial/journal/journal?mode=updates");
  });

  it("locks unknown tours and steps before revealing whether they exist", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect(
      await TutorialLayout({ params: Promise.resolve({ tourId: "missing" }), children: "gate" }),
    ).toBe("gate");
    await expect(
      TutorialPage({
        params: Promise.resolve({ tourId: "missing", stepId: "missing" }),
        searchParams: Promise.resolve({ from: "account" }),
      }),
    ).resolves.toMatchObject({ props: { next: "/tutorial/missing/missing?from=account" } });
    await expect(
      TutorialStart({
        params: Promise.resolve({ tourId: "missing" }),
        searchParams: Promise.resolve({ mode: "updates" }),
      }),
    ).resolves.toMatchObject({ props: { next: "/tutorial/missing?mode=updates" } });
  });
});
