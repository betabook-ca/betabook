import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { expect, it, vi } from "vitest";

import { useRouter } from "@/spa/lib/navigation";

import SearchRoute from "./search-route";

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ isPending: false, data: null }) },
}));

function HistoryControls() {
  const router = useRouter();
  const location = useLocation();
  return (
    <>
      <button type="button" onClick={router.back}>
        Back
      </button>
      <button type="button" onClick={router.forward}>
        Forward
      </button>
      <output aria-label="URL">{location.pathname + location.search}</output>
    </>
  );
}

it("retains the query field from home through category and history navigation", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        climbs: [],
        areas: [],
        areaBreadcrumbs: {},
        sendStats: {},
        hasNextPage: false,
      }),
    ),
  );
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/"]}>
      <HistoryControls />
      <Routes>
        <Route path="/" element={<SearchRoute viewerId={null} home />} />
        <Route path="/search" element={<SearchRoute viewerId={null} />} />
      </Routes>
    </MemoryRouter>,
  );
  const field = screen.getByRole("searchbox", { name: "Search Betabook" });
  await user.type(field, "granite");
  await waitFor(() =>
    expect(screen.getByRole("status", { name: "URL" })).toHaveTextContent(
      /\/search\?.*name=granite/,
    ),
  );
  expect(screen.getByRole("searchbox", { name: "Search Betabook" })).toBe(field);
  expect(field).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Climbs" }));
  expect(screen.getByRole("searchbox", { name: "Search Betabook" })).toBe(field);
  expect(field).toHaveValue("granite");
  await user.click(screen.getByRole("button", { name: "Back" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true"),
  );
  await user.click(screen.getByRole("button", { name: "Forward" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Climbs" })).toHaveAttribute("aria-pressed", "true"),
  );
  expect(screen.getByRole("searchbox", { name: "Search Betabook" })).toBe(field);
});
