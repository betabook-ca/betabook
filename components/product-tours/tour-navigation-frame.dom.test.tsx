import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

import { PRODUCT_TOUR_STEPS, productTourPath } from "@/lib/product-tour-navigation";

import { JournalTourPage } from "./journal-tour";

const router = vi.hoisted(() => ({ push: vi.fn<(href: string) => void>() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/tutorial/journal/journal",
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function lesson(section = "Journal") {
  return (
    <JournalTourPage
      section={section}
      mode="updates"
      steps={PRODUCT_TOUR_STEPS.journal}
      href={(stepId, mode = "updates") =>
        productTourPath("journal", { stepId, mode, from: "account" })
      }
    />
  );
}

it("shows all four primary areas with safe lesson links on desktop and mobile", () => {
  render(lesson());
  for (const name of ["Example desktop navigation", "Example mobile navigation"]) {
    const links = within(screen.getByRole("navigation", { name })).getAllByRole("link");
    expect(
      links.map(
        (link) => new URL(link.getAttribute("href") ?? "", "https://betabook.test").pathname,
      ),
    ).toEqual([
      "/tutorial/journal/journal",
      "/tutorial/journal/projects",
      "/tutorial/journal/feed",
      "/tutorial/journal/account",
    ]);
    for (const link of links) {
      const url = new URL(link.getAttribute("href") ?? "", "https://betabook.test");
      expect(url.searchParams.get("mode")).not.toBe("updates");
      expect(url.searchParams.get("from")).toBe("account");
    }
  }
  for (const link of screen.getAllByRole("link"))
    expect(link.getAttribute("href")).toMatch(/^\/tutorial\/journal\//);
});

it("opens example search instead of real account data", async () => {
  const user = userEvent.setup();
  render(lesson());
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(router.push).toHaveBeenCalledWith(
    productTourPath("journal", { stepId: "find-climbers", mode: "full", from: "account" }),
  );
});

it("keeps the example friend-request state when switching between Community subpages", async () => {
  const user = userEvent.setup();
  const { rerender } = render(lesson("Friends"));
  await user.click(screen.getByRole("button", { name: /Accept/ }));
  rerender(lesson("Feed"));
  rerender(lesson("Friends"));
  expect(screen.getByText("No pending friend requests.")).toBeVisible();
  const subpages = screen.getByRole("navigation", { name: "Community sections" });
  expect(within(subpages).getByRole("link", { name: "Feed" })).toHaveAttribute(
    "href",
    productTourPath("journal", { stepId: "feed", mode: "updates", from: "account" }),
  );
  expect(within(subpages).getByRole("link", { name: "Friends" })).toBeInTheDocument();
});
