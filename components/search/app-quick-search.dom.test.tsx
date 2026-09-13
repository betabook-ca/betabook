import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { AppQuickSearch } from "@/components/search/app-quick-search";
import { AUTH_REQUIRED_EVENT } from "@/lib/api-client";

const identity = vi.hoisted(() => ({ sessionId: "expired" }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "member" }, session: { id: identity.sessionId } },
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
  expect(screen.getByRole("region", { name: "Member content" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Sign up" })).toBeVisible();
  await user.click(screen.getByRole("link", { name: "Sign up" }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  identity.sessionId = "signed-in-again";
  rerender(<AppQuickSearch {...props} />);
  expect(await screen.findByText("Member identity")).toBeVisible();
  expect(screen.queryByRole("region", { name: "Member content" })).not.toBeInTheDocument();
});
