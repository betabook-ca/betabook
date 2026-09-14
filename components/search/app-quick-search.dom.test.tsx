import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { AppQuickSearch } from "@/components/search/app-quick-search";
import { AUTH_REQUIRED_EVENT } from "@/lib/api-client";

const identity = vi.hoisted(() => ({ sessionId: "expired", signedIn: true }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: identity.signedIn
        ? { user: { id: "member" }, session: { id: identity.sessionId } }
        : null,
      isPending: false,
    }),
  },
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    prefetch: _prefetch,
    onClick,
    href,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));
afterEach(() => vi.unstubAllGlobals());
it("clears cached member results when another data request reports an expired session", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.includes("/climbers"))
        return Response.json({
          climbers: [
            { id: "private", name: "Member identity", image: null, friendshipStatus: "none" },
          ],
          hasMore: false,
        });
      return Response.json({ climbs: [], areas: [], areaBreadcrumbs: {}, hasNextPage: false });
    }),
  );
  const user = userEvent.setup();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const props = { isOpen: true, onOpenChange, onNavigate: () => {} };
  const { rerender } = render(<AppQuickSearch {...props} />);
  await user.type(screen.getByRole("combobox", { name: "Search Betabook" }), "Member");
  expect(await screen.findByText("Member identity")).toBeVisible();
  act(() => {
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  });
  expect(screen.queryByText("Member identity")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  identity.sessionId = "signed-in-again";
  rerender(<AppQuickSearch {...props} />);
  expect(await screen.findByText("Member identity")).toBeVisible();
  expect(screen.queryByRole("region", { name: "Member content" })).not.toBeInTheDocument();
});

it("does not render or fetch quick search for signed-out visitors", () => {
  identity.signedIn = false;
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  render(<AppQuickSearch isOpen onOpenChange={() => {}} onNavigate={() => {}} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
  identity.signedIn = true;
});

it("reopening member quick search resets its query and category", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        climbs: [],
        areas: [],
        climbers: [],
        hasNextPage: false,
        hasMore: false,
      }),
    ),
  );
  const user = userEvent.setup();
  const props = { onOpenChange: () => {}, onNavigate: () => {} };
  const { rerender } = render(<AppQuickSearch {...props} isOpen />);
  await user.type(screen.getByRole("combobox", { name: "Search Betabook" }), "previous query");
  await user.click(screen.getByRole("button", { name: "Climbs" }));
  rerender(<AppQuickSearch {...props} isOpen={false} />);
  rerender(<AppQuickSearch {...props} isOpen />);
  expect(screen.getByRole("combobox", { name: "Search Betabook" })).toHaveValue("");
  expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("option")).not.toBeInTheDocument();
});
