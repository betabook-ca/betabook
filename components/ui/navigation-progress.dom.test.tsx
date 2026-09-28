import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import { AppLink } from "./app-link";
import { NavigationProgress } from "./navigation-progress";

const router = vi.hoisted(() => ({
  pathname: "/feed",
  search: "",
  /** Settles the navigation the last click started, as the router does once
   * the next page has rendered. */
  settle: null as null | (() => void),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => router.pathname,
  useSearchParams: () => new URLSearchParams(router.search),
}));

// The router boundary: like vinext's Link, a click marks the link pending
// for descendants reading useLinkStatus until the navigation settles.
vi.mock("next/link", async () => {
  const { createContext, useContext, useMemo, useState } = await import("react");
  const LinkStatus = createContext({ pending: false });
  function Link({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: Omit<ComponentProps<"a">, "href"> & {
    href: string;
    prefetch?: unknown;
    children: ReactNode;
  }) {
    const [pending, setPending] = useState(false);
    const status = useMemo(() => ({ pending }), [pending]);
    return (
      <LinkStatus.Provider value={status}>
        <a
          href={href}
          {...props}
          onClick={(event) => {
            event.preventDefault();
            setPending(true);
            router.settle = () => setPending(false);
          }}
        >
          {children}
        </a>
      </LinkStatus.Provider>
    );
  }
  return { default: Link, useLinkStatus: () => useContext(LinkStatus) };
});

beforeEach(() => {
  router.pathname = "/feed";
  router.search = "";
  router.settle = null;
  window.history.replaceState({}, "", "/feed");
});

function arrive(path: string) {
  const url = new URL(path, window.location.origin);
  window.history.pushState({}, "", url);
  router.pathname = url.pathname;
  router.search = url.search;
}

function Page({
  menuOpen = true,
  menuHref = "/friends",
}: {
  menuOpen?: boolean;
  menuHref?: string;
}) {
  return (
    <>
      <NavigationProgress />
      <AppLink href="/users/u/sends">Sends</AppLink>
      {menuOpen && <AppLink href={menuHref}>Menu item</AppLink>}
    </>
  );
}

it("shows progress from the click until the navigation settles", async () => {
  const user = userEvent.setup();
  const view = render(<Page />);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

  await user.click(screen.getByRole("link", { name: "Sends" }));
  expect(screen.getByRole("progressbar", { name: "Loading page" })).toBeInTheDocument();

  arrive("/users/u/sends");
  view.rerender(<Page />);
  // Still in flight until the router settles it, even with the URL updated.
  expect(screen.getByRole("progressbar", { name: "Loading page" })).toBeInTheDocument();
  act(() => router.settle?.());
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

it("keeps progress after a closing menu unmounts the clicked link, until the page changes", async () => {
  const user = userEvent.setup();
  const view = render(<Page />);
  await user.click(screen.getByRole("link", { name: "Menu item" }));
  view.rerender(<Page menuOpen={false} />);
  expect(screen.getByRole("progressbar", { name: "Loading page" })).toBeInTheDocument();

  arrive("/friends?view=requests");
  view.rerender(<Page menuOpen={false} />);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});

it("drops progress when a closing menu's link pointed at the page already open", async () => {
  const user = userEvent.setup();
  const view = render(<Page menuHref="/feed" />);
  await user.click(screen.getByRole("link", { name: "Menu item" }));
  expect(screen.getByRole("progressbar", { name: "Loading page" })).toBeInTheDocument();
  view.rerender(<Page menuOpen={false} menuHref="/feed" />);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});
