import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import AuthRouteView from "./auth-routes";

afterEach(() => vi.unstubAllGlobals());

it("recovers the configured sign-in methods after an unavailable auth config", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ googleEnabled: true, turnstileSiteKey: null }));
  vi.stubGlobal("fetch", fetch);
  render(
    <MemoryRouter>
      <AuthRouteView kind="sign-in" viewerId={null} />
    </MemoryRouter>,
  );
  await screen.findByRole("alert");
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("button", { name: /Google/ })).toBeVisible();
  expect(screen.getByLabelText("Password")).toBeVisible();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/config/auth", "/api/config/auth"]);
});
