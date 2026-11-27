import { afterEach, describe, expect, it, vi } from "vitest";

import { withClimbFilterArea } from "@/lib/filters/climb-filter-state";

import { EMPTY_SEARCH } from "./search";
import { fetchSearchPage } from "./search-client";

const fetchMock = vi.fn<typeof fetch>();
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});
describe("unified search transport", () => {
  it("sends the selected ID and preserves page metadata for a concrete climb selection", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        climbs: [
          {
            id: 7,
            name: "Cedar Arete",
            areaId: 3,
            areaName: "Cedar Grove",
            type: "boulder",
            grade: 5,
          },
        ],
        hasNextPage: true,
        sendStats: { 7: { sendCount: 9 } },
        areaBreadcrumbs: { 3: [{ id: 1, name: "Oregon" }] },
        sentClimbIds: [7],
      }),
    );
    const state = withClimbFilterArea(
      { ...EMPTY_SEARCH, query: "cedar" },
      { id: "3", name: "Cedar Grove", path: "Oregon" },
    );
    const controller = new AbortController();
    const page = await fetchSearchPage(state, "climb", 2, controller.signal);
    const url = new URL(fetchMock.mock.calls[0][0] as string, "https://example.test");
    expect(url.pathname).toBe("/api/search/climbs");
    expect(url.searchParams.get("areaId")).toBe("3");
    expect(url.searchParams.get("page")).toBe("2");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      signal: controller.signal,
      cache: "no-store",
    });
    expect(page).toMatchObject({
      hasMore: true,
      nextPage: 3,
      items: [
        {
          id: "climb-7",
          href: "/climbs/7/cedar-arete",
          detail: "Oregon / Cedar Grove",
          context: { sent: true, sendCount: 9 },
        },
      ],
    });
  });
  it("uses the private climber endpoint and its offset without caching a viewer's results", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        climbers: [{ id: "person", name: "Cedar Lee", image: null, friendshipStatus: "friends" }],
        hasMore: false,
      }),
    );
    const page = await fetchSearchPage(
      { ...EMPTY_SEARCH, query: "Cedar" },
      "climber",
      2,
      new AbortController().signal,
    );
    const url = new URL(fetchMock.mock.calls[0][0] as string, "https://example.test");
    expect(url.pathname).toBe("/api/search/climbers");
    expect(url.searchParams.get("offset")).toBe("20");
    expect(fetchMock.mock.calls[0][1]?.cache).toBe("no-store");
    expect(page.items).toMatchObject([
      { id: "climber-person", climber: { friendshipStatus: "friends" } },
    ]);
  });
  it("propagates failures so the controller can offer Retry", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(
      fetchSearchPage(EMPTY_SEARCH, "area", 1, new AbortController().signal),
    ).rejects.toThrow("Search unavailable");
  });
});
