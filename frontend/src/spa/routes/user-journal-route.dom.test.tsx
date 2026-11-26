import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import UserJournalRoute from "./user-journal-route";
import UserProfileRoute from "./user-profile-route";

vi.unmock("@/spa/lib/router-link");

afterEach(() => vi.unstubAllGlobals());

it.each(["/users/:id/journal", "/users/:id"])(
  "keeps journal filters mounted on %s while fetching only entries",
  async (path) => {
    const workspace = {
      user: { id: "owner", name: "Owner", image: null, isPrivate: false },
      isOwner: true,
      relationship: "none",
      access: { journal: true, lists: true, trips: true },
      hardest: [],
      journal: {
        hasEntries: true,
        firstPage: { entries: [], hasMore: false },
        areaBreadcrumbs: {},
        tags: [],
        friends: [],
        filteredClimbName: null,
        tourState: null,
      },
    };
    let finish!: (res: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ ...workspace, mode: "member", defaultTab: "journal" }))
      .mockReturnValue(pending);
    vi.stubGlobal("fetch", fetch);
    const route = (viewerId: string) => (
      <MemoryRouter initialEntries={[path.replace(":id", "owner")]}>
        <Routes>
          <Route
            path={path}
            element={
              path.endsWith("/journal") ? (
                <UserJournalRoute viewerId={viewerId} />
              ) : (
                <UserProfileRoute viewerId={viewerId} />
              )
            }
          />
        </Routes>
      </MemoryRouter>
    );
    const ui = render(route("owner"));
    const training = await screen.findByRole("link", { name: "Training" });
    const user = userEvent.setup();
    await user.click(training);
    expect(screen.queryByRole("link", { name: "Training" })).toBe(training);
    expect(training).toHaveFocus();
    await waitFor(() =>
      expect(fetch.mock.calls.map(([url]) => url)).toContain(
        "/api/users/owner/journal?view=training",
      ),
    );
    expect(training).toHaveAttribute("aria-current", "page");
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    const sessions = screen.getByRole("link", { name: "Sessions" });
    fetch.mockResolvedValueOnce(
      Response.json({ entries: [], hasMore: false, areaBreadcrumbs: {} }),
    );
    await user.click(sessions);
    await waitFor(() =>
      expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument(),
    );
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      path.endsWith("/journal") ? "/api/pages/users/owner/journal" : "/api/pages/users/owner",
      "/api/users/owner/journal?view=training",
      "/api/users/owner/journal?view=sessions",
    ]);
    expect(fetch.mock.calls[1][1]?.signal?.aborted).toBe(true);
    // A slower, superseded response must not replace the current session list.
    await act(async () => finish(Response.json({ error: "No access" }, { status: 404 })));
    expect(screen.getByRole("link", { name: "Sessions" })).toBe(sessions);
    expect(sessions).toHaveAttribute("aria-current", "page");
    expect(sessions).toHaveFocus();
    fetch.mockReturnValue(new Promise(() => {}));
    ui.rerender(route("different-viewer"));
    expect(screen.queryByRole("link", { name: "Training" })).not.toBeInTheDocument();
  },
);
