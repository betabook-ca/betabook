import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, it, vi } from "vitest";

import TutorialRoute from "./tutorial-route";

function open(path: string, viewerId: string | null) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tutorial/:tourId/:stepId?" element={<TutorialRoute viewerId={viewerId} />} />
      </Routes>
    </MemoryRouter>,
  );
}

it("preserves the locked step without looking up a private tour", () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  open("/tutorial/unknown/private?from=account&mode=updates", null);
  const continuation = new URL(
    screen.getByRole("link", { name: "Sign in" }).getAttribute("href") ?? "",
    "http://localhost",
  );
  expect(continuation.searchParams.get("next")).toBe("/tutorial/unknown/private?from=account");
  expect(fetch).not.toHaveBeenCalled();
});

it("shows a missing step before fetching member progress", () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  open("/tutorial/journal/missing", "owner");
  expect(screen.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});
