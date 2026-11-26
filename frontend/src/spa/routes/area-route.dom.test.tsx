import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

import AreaRoute from "./area-route";

it("refines public area rows without reloading its header or replacing the focused textbox", async () => {
  const user = userEvent.setup();
  const details = {
    area: { id: 42, name: "North wall", parentId: null, description: "Cedar crag" },
    ancestors: [],
    subareas: [],
  };
  const rows = { climbs: [], hasNextPage: false, areaBreadcrumbs: {} };
  let detailReads = 0;
  let finish: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input) => {
      const url = new URL(input instanceof Request ? input.url : input, "http://localhost");
      if (url.pathname === "/api/public/areas/42") {
        detailReads += 1;
        return Response.json(details);
      }
      if (url.pathname === "/api/public/areas/42/climbs") {
        if (url.searchParams.get("name") === "granite")
          return new Promise<Response>((resolve) => {
            finish = resolve;
          });
        return Response.json(rows);
      }
      throw new Error("Unexpected " + url.pathname);
    }),
  );
  render(
    <MemoryRouter initialEntries={["/areas/42/north-wall"]}>
      <Routes>
        <Route path="/areas/:id/*" element={<AreaRoute viewerId={null} />} />
      </Routes>
    </MemoryRouter>,
  );
  const header = await screen.findByRole("heading", { name: "North wall" });
  const field = screen.getByRole("searchbox", { name: "Filter climbs in this area" });
  await user.type(field, "granite");
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(screen.getByRole("heading", { name: "North wall" })).toBe(header);
  expect(screen.getByRole("searchbox", { name: "Filter climbs in this area" })).toBe(field);
  expect(field).toHaveFocus();
  expect(detailReads).toBe(1);
  await act(async () => finish?.(Response.json(rows)));
  expect(field).toHaveFocus();
});
