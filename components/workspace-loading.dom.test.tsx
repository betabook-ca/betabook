import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { CommunityLoading, ProfileLoading } from "./workspace-loading";

type Session = { user: { id: string } } | null;
const state = vi.hoisted(() => ({
  pathname: "/users/owner/sends",
  session: null as Session,
  sessionPending: false,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useParams: () => ({ id: state.pathname.split("/")[2] }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: state.session, isPending: state.sessionPending }),
  },
}));

beforeEach(() => {
  state.pathname = "/users/owner/sends";
  state.session = { user: { id: "owner" } };
  state.sessionPending = false;
});

const sections = (area: string) => screen.queryByRole("navigation", { name: `${area} sections` });

it.each([
  ["/users/owner/sends", "Logbook", "Sends"],
  ["/users/owner/trips/t1/analytics", "Logbook", "Trips"],
  ["/users/owner/goals", "Progress", "Goals"],
  ["/users/owner/projects/sent", "Progress", "Projects"],
])("keeps the owner's %s tabs in place while the page loads", (path, area, current) => {
  state.pathname = path;
  render(<ProfileLoading />);

  const tabs = within(sections(area)!).getAllByRole("link");
  expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual(
    area === "Logbook"
      ? ["/users/owner/journal", "/users/owner/sends", "/users/owner/trips"]
      : ["/users/owner/goals", "/users/owner/projects", "/users/owner/analytics"],
  );
  expect(within(sections(area)!).getByRole("link", { name: current })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

it.each([
  ["another climber's profile", { user: { id: "viewer" } }, false],
  ["a signed-out reader", null, false],
  ["a session still loading", null, true],
])("shows no workspace tabs to %s", (_, session, pending) => {
  state.session = session;
  state.sessionPending = pending;
  render(<ProfileLoading />);

  expect(sections("Logbook")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("keeps a member's Community tabs in place while Feed or Friends loads", () => {
  state.pathname = "/friends";
  render(
    <CommunityLoading label="Loading friends">
      <p>Placeholder rows</p>
    </CommunityLoading>,
  );

  const tabs = within(sections("Community")!).getAllByRole("link");
  expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual(["/feed", "/friends"]);
  expect(within(sections("Community")!).getByRole("link", { name: "Friends" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("status", { name: "Loading friends" })).toHaveTextContent(
    "Placeholder rows",
  );
});

it("gives a signed-out reader the placeholder without member tabs", () => {
  state.pathname = "/feed";
  state.session = null;
  render(
    <CommunityLoading label="Loading feed">
      <p>Placeholder cards</p>
    </CommunityLoading>,
  );

  expect(sections("Community")).not.toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Loading feed" })).toHaveTextContent(
    "Placeholder cards",
  );
});
