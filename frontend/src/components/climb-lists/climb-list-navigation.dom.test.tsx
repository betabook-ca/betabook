import { useOverlayState } from "@heroui/react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createBrowserRouter, RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import { createClimbList } from "@/spa/lib/actions-client";

import { ClimbListDialog } from "./climb-list-dialog";

vi.mock("@/spa/lib/actions-client", () => ({ createClimbList: vi.fn<typeof createClimbList>() }));

function CreateList() {
  const state = useOverlayState({ defaultOpen: true });
  return <ClimbListDialog state={state} userId="alex" mode={{ kind: "create" }} />;
}

afterEach(() => window.history.replaceState(null, "", "/"));

it.each(["different route", "Back to the same URL"] as const)(
  "does not redirect an earlier list creation after navigation: %s",
  async (destination) => {
    let finish!: (result: Awaited<ReturnType<typeof createClimbList>>) => void;
    const save = new Promise<Awaited<ReturnType<typeof createClimbList>>>((resolve) => {
      finish = resolve;
    });
    vi.mocked(createClimbList).mockReturnValue(save);
    window.history.replaceState(null, "", "/lists");
    const router = createBrowserRouter([
      { path: "/lists", element: <CreateList /> },
      { path: "/friends", element: <h1>Friends</h1> },
      { path: "/users/alex/lists/:id", element: <h1>New list</h1> },
    ]);
    render(<RouterProvider router={router} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox", { name: /Name/ }), "Winter list");
    await user.click(screen.getByRole("button", { name: "Create list" }));
    expect(createClimbList).toHaveBeenCalledOnce();
    await act(() => router.navigate("/friends"));
    if (destination === "Back to the same URL") {
      await act(() => router.navigate(-1));
      await waitFor(() => expect(router.state.location.pathname).toBe("/lists"));
    }
    await act(async () => {
      finish({ ok: true, value: { id: 9, title: "Winter list" } });
    });
    expect(router.state.location.pathname).toBe(
      destination === "different route" ? "/friends" : "/lists",
    );
    router.dispose();
  },
);
