import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

import UserSendsRoute from "./user-sends-route";

function send(name: string, id: number) {
  return {
    id,
    climbId: id,
    climbName: name,
    climbType: "boulder",
    climbGrade: 5,
    areaId: 1,
    areaName: "Cedar",
    ascentStyle: "flash",
    dateSent: "2026-01-01",
    rating: 4,
    suggestedGrade: null,
    gradeFeel: "solid",
    comment: null,
    videos: null,
  };
}

it("keeps the sends workspace and filters mounted and accepts only the latest result list", async () => {
  const user = userEvent.setup();
  const delayed: {
    url: URL;
    resolve: (r: Response) => void;
    signal: AbortSignal | null | undefined;
  }[] = [];
  const header = {
    user: { id: "owner", name: "Owner" },
    isOwner: true,
    relationship: "none",
    access: { journal: true, lists: true, trips: true },
    hardest: [],
  };
  let pageRequests = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/pages/users/owner/sends") {
        pageRequests += 1;
        return Response.json({
          ...header,
          sends: {
            tags: [],
            hasSends: true,
            firstPage: { sends: [send("Original send", 1)], hasMore: false },
            areaBreadcrumbs: {},
          },
        });
      }
      if (url.pathname === "/api/users/owner/sends")
        return new Promise<Response>((resolve) =>
          delayed.push({ url, resolve, signal: init?.signal }),
        );
      throw new Error("Unexpected " + url.pathname);
    }),
  );
  render(
    <MemoryRouter initialEntries={["/users/owner/sends"]}>
      <Routes>
        <Route path="/users/:id/sends" element={<UserSendsRoute viewerId="owner" />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText("Original send");
  const workspace = screen.getByRole("region", { name: "Logbook workspace" });
  const input = screen.getByRole("searchbox", { name: "Filter sends" });
  await user.click(screen.getByRole("button", { name: "Expand filters" }));
  const boulder = screen.getByRole("button", { name: "Boulder" });
  await user.click(boulder);
  await waitFor(() => expect(delayed).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Hide filters" })).toBeVisible();
  expect(boulder).toHaveFocus();
  expect(screen.getByText("Original send")).toBeVisible();
  expect(workspace.querySelector('[aria-busy="true"]')).not.toBeNull();
  await user.type(input, "granite");
  await waitFor(() => expect(delayed.at(-1)?.url.searchParams.get("name")).toBe("granite"));
  expect(delayed[0].signal?.aborted).toBe(true);
  expect(screen.getByRole("region", { name: "Logbook workspace" })).toBe(workspace);
  expect(screen.getByRole("searchbox", { name: "Filter sends" })).toBe(input);
  await act(async () => {
    delayed
      .at(-1)
      ?.resolve(
        Response.json({ sends: [send("Current send", 2)], hasMore: false, areaBreadcrumbs: {} }),
      );
  });
  await screen.findByText("Current send");
  await act(async () =>
    delayed[0].resolve(
      Response.json({ sends: [send("Obsolete send", 3)], hasMore: false, areaBreadcrumbs: {} }),
    ),
  );
  expect(screen.queryByText("Obsolete send")).not.toBeInTheDocument();
  expect(input).toHaveFocus();
  expect(pageRequests).toBe(1);
});
