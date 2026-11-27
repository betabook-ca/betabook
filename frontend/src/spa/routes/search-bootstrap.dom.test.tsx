import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import { clearBootstrapData } from "@/spa/bootstrap";

import SearchRoute from "./search-route";

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }) },
}));
afterEach(() => {
  clearBootstrapData();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("adopts both public sections and their selected area without another request in StrictMode", async () => {
  vi.useFakeTimers();
  const transport = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", transport);
  const params = "mode=all&name=Easy%20Forager&areaId=7&discipline=sport&discipline=trad";
  const script = document.createElement("script");
  script.type = "application/json";
  script.id = "__BETABOOK_DATA__";
  script.textContent = JSON.stringify({
    route: "search",
    path: "/search",
    query: params,
    data: {
      areaSelection: { id: "7", name: "Base camp", path: "" },
      climbsPage: {
        climbs: [
          {
            id: 1,
            areaId: 7,
            areaName: "Base camp",
            name: "Easy Forager",
            type: "sport",
            grade: 12,
            description: null,
            brokenOn: null,
            avgRating: null,
            sendCount: 0,
          },
        ],
        areaBreadcrumbs: {},
        hasNextPage: false,
      },
      areasPage: {
        areas: [
          {
            id: 9,
            name: "Easy Forager crag",
            parentId: 7,
            description: null,
            ancestorPath: "Base camp",
          },
        ],
        hasNextPage: false,
      },
    },
  });
  document.body.appendChild(script);
  render(
    <StrictMode>
      <MemoryRouter initialEntries={["/search?" + params]}>
        <SearchRoute viewerId={null} />
      </MemoryRouter>
    </StrictMode>,
  );
  expect(screen.getByRole("link", { name: "Open Easy Forager, Base camp" })).toHaveAttribute(
    "href",
    "/climbs/1/easy-forager",
  );
  expect(screen.getByRole("link", { name: "Open Easy Forager crag, Base camp" })).toHaveAttribute(
    "href",
    "/areas/9/easy-forager-crag",
  );
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(transport).not.toHaveBeenCalled();
});
