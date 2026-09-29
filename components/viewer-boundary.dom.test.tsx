import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ActionResult } from "@/lib/action-result";
import { authClient } from "@/lib/auth-client";

import { TermsGate } from "./terms-gate";
import { ViewerBoundary } from "./viewer-boundary";

const { refresh, transport, router } = vi.hoisted(() => {
  const refresh = vi.fn<() => void>();
  return { refresh, router: { refresh }, transport: vi.fn<typeof fetch>() };
});
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/users/alex",
  useSearchParams: () => new URLSearchParams("view=sends"),
}));
vi.mock("@/lib/auth-client", async () => {
  const { createAuthClient } = await import("better-auth/react");
  return {
    authClient: createAuthClient({
      baseURL: "http://localhost:3000",
      fetchOptions: { customFetchImpl: transport },
    }),
  };
});
function session(id: string) {
  return Response.json({
    user: { id, name: id, email: `${id}@example.com`, emailVerified: true },
    session: { id: `session-${id}`, userId: id, expiresAt: "2099-01-01T00:00:00.000Z" },
  });
}
vi.mock("@/actions/terms", () => ({ acceptTerms: vi.fn<() => Promise<ActionResult>>() }));
beforeEach(async () => {
  transport.mockImplementation(async () => session("alex"));
  await act(() => authClient.$store.atoms.session.get().refetch());
  transport.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("owns the tab-return refresh that re-checks terms, so the gate asks nothing itself", () => {
  const requests = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", requests);
  render(
    <ViewerBoundary viewerId="alex">
      <TermsGate viewerId="alex" initiallyRequired={false}>
        <p>Member content</p>
      </TermsGate>
    </ViewerBoundary>,
  );
  refresh.mockClear();
  act(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // The refreshed template re-renders the gate with the server's answer.
  expect(refresh).toHaveBeenCalledOnce();
  expect(requests).not.toHaveBeenCalled();
  expect(screen.getByText("Member content")).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("coalesces focus/visibility checks without remounting content, and cleans up on unmount", async () => {
  const user = userEvent.setup();
  const { unmount } = render(
    <ViewerBoundary viewerId="alex">
      <input aria-label="Notes" />
    </ViewerBoundary>,
  );
  const input = screen.getByRole("textbox", { name: "Notes" });
  await user.type(input, "Unsaved notes");
  refresh.mockClear();
  // Window focus and document visibility have no user-event tab-switch API.
  act(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.getByRole("textbox", { name: "Notes" })).toBe(input);
  expect(input).toHaveValue("Unsaved notes");
  unmount();
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(refresh).toHaveBeenCalledOnce();
});

it("discards local state when the server viewer changes, and hides data on sign-out", async () => {
  const user = userEvent.setup();
  const content = <input aria-label="Notes" />;
  const { rerender } = render(<ViewerBoundary viewerId="alex">{content}</ViewerBoundary>);
  const input = screen.getByRole("textbox", { name: "Notes" });
  await user.type(input, "Alex's private draft");
  // A refreshed server tree can arrive before the auth client's session check.
  transport.mockImplementation(async () => session("sam"));
  rerender(<ViewerBoundary viewerId="sam">{content}</ViewerBoundary>);
  act(() => authClient.$store.notify("$sessionSignal"));
  const next = await screen.findByRole("textbox", { name: "Notes" });
  expect(next).not.toBe(input);
  expect(next).toHaveValue("");
  transport.mockImplementation(async () => Response.json(null));
  act(() => authClient.$store.notify("$sessionSignal"));
  await screen.findByText("For Betabook members");
  expect(screen.queryByRole("textbox", { name: "Notes" })).not.toBeInTheDocument();
  let resolve!: (response: Response) => void;
  transport.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  act(() => authClient.$store.notify("$sessionSignal"));
  await waitFor(() => expect(authClient.$store.atoms.session.get().isPending).toBe(true));
  expect(screen.queryByRole("textbox", { name: "Notes" })).not.toBeInTheDocument();
  await act(async () => resolve(Response.json(null)));
});

it("resets drafts when the server account changes while the session check is pending", async () => {
  transport.mockImplementation(async () => Response.json(null));
  await act(() => authClient.$store.atoms.session.get().refetch());
  let resolve!: (response: Response) => void;
  transport.mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const user = userEvent.setup();
  const content = <input aria-label="Notes" />;
  const { rerender } = render(<ViewerBoundary viewerId={null}>{content}</ViewerBoundary>);
  await user.type(screen.getByRole("textbox", { name: "Notes" }), "Previous draft");
  act(() => authClient.$store.notify("$sessionSignal"));
  await waitFor(() => expect(authClient.$store.atoms.session.get().isPending).toBe(true));
  rerender(<ViewerBoundary viewerId="sam">{content}</ViewerBoundary>);
  expect(screen.queryByRole("textbox", { name: "Notes" })).not.toBeInTheDocument();
  await act(async () => resolve(session("sam")));
  expect(await screen.findByRole("textbox", { name: "Notes" })).toHaveValue("");
});

it("removes member content immediately when a data request returns 401", async () => {
  const { AUTH_REQUIRED_EVENT } = await import("@/lib/api-client");
  render(
    <ViewerBoundary viewerId="alex">
      <p>Protected activity</p>
    </ViewerBoundary>,
  );
  expect(screen.getByText("Protected activity")).toBeVisible();
  act(() => {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  });
  expect(screen.queryByText("Protected activity")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/sign-in?next=%2Fusers%2Falex%3Fview%3Dsends",
  );
  expect(screen.getByRole("link", { name: "Sign up" })).toBeVisible();
});
