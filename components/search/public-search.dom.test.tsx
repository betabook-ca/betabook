import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { SearchController } from "@/components/search/search-controller";
import { DEFAULT_BOULDER_RANGE } from "@/lib/filters/discipline-filter";
import { EMPTY_SEARCH, searchHref } from "@/lib/search";

vi.mock("next/link", () => ({
  default: ({
    children,
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props}>{children}</a>,
}));
afterEach(() => vi.unstubAllGlobals());
function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}
function Search({
  publicOnly = true,
  quick = false,
  showMemberNotice,
}: {
  publicOnly?: boolean;
  quick?: boolean;
  showMemberNotice?: boolean;
}) {
  const [state, setState] = useState({ ...EMPTY_SEARCH, query: "Test" });
  return (
    <SearchController
      publicOnly={publicOnly}
      quick={quick}
      showMemberNotice={showMemberNotice}
      state={state}
      onChange={setState}
      onNavigate={() => {}}
      onExpand={() => {}}
      resultHref={(item) => item.href}
    />
  );
}
it("shows public grades and aggregates from catalog endpoints, with climbers locked", async () => {
  const transport = vi.fn<typeof fetch>(async (url) =>
    requestUrl(url).includes("/climbs?")
      ? Response.json({
          climbs: [
            {
              id: 1,
              name: "Test route",
              areaId: 2,
              areaName: "Test area",
              grade: 5,
              type: "boulder",
              description: "A route.",
              avgRating: 4,
              sendCount: 12,
            },
          ],
          areaBreadcrumbs: {},
          hasNextPage: false,
        })
      : Response.json({ areas: [], hasNextPage: false }),
  );
  vi.stubGlobal("fetch", transport);
  const user = userEvent.setup();
  render(<Search />);
  expect(await screen.findByRole("link", { name: "Open Test route, Test area" })).toBeVisible();
  expect(screen.getByText("V4")).toBeVisible();
  expect(screen.getByText("Boulder")).toBeVisible();
  expect(screen.getByText("12 ascents")).toBeVisible();
  expect(transport.mock.calls).toHaveLength(2);
  expect(transport.mock.calls.map(([url]) => requestUrl(url))).toEqual(
    expect.arrayContaining([
      expect.stringContaining("/api/public/search/climbs?"),
      expect.stringContaining("/api/public/search/areas?"),
    ]),
  );
  // Climb refinements belong to the Climbs tab; a mixed list has nothing to apply them to.
  expect(screen.queryByRole("button", { name: "Expand filters" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Climbers" }));
  expect(screen.getByText("Sign in to view climbers.")).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Open Test route, Test area" }),
  ).not.toBeInTheDocument();
  expect(transport.mock.calls.some(([url]) => requestUrl(url).includes("/climbers"))).toBe(false);
});
it("discards a late member response after switching to public search", async () => {
  let resolve!: (response: Response) => void;
  const transport = vi.fn<typeof fetch>().mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  vi.stubGlobal("fetch", transport);
  const { rerender } = render(<Search key="member" publicOnly={false} />);
  await waitFor(() => expect(transport).toHaveBeenCalled());
  const finish = resolve;
  transport.mockImplementation(async () =>
    Response.json({ climbs: [], areas: [], areaBreadcrumbs: {}, hasNextPage: false }),
  );
  rerender(<Search key="anonymous" />);
  await act(async () =>
    finish(
      Response.json({
        climbers: [
          { id: "private", name: "Stale private name", image: null, friendshipStatus: "none" },
        ],
        hasMore: false,
      }),
    ),
  );
  expect(screen.queryByText("Stale private name")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Member content" })).toBeVisible();
});

it("sends the full refinement set to the public catalog and shows what it returns", async () => {
  const transport = vi.fn<typeof fetch>(async (url) =>
    requestUrl(url).includes("/climbs?")
      ? Response.json({
          climbs: [
            {
              id: 1,
              name: "Test route",
              areaId: 2,
              areaName: "Test area",
              grade: 5,
              type: "boulder",
              description: "A route.",
              avgRating: 4,
              sendCount: 12,
            },
          ],
          areaBreadcrumbs: {},
          hasNextPage: false,
        })
      : Response.json({ areas: [], hasNextPage: false }),
  );
  vi.stubGlobal("fetch", transport);
  const climbRequests = () =>
    transport.mock.calls
      .map(([url]) => requestUrl(url))
      .filter((url) => url.includes("/api/public/search/climbs"));
  const user = userEvent.setup();
  render(<Search />);
  await user.click(screen.getByRole("button", { name: "Climbs" }));
  await user.click(await screen.findByRole("button", { name: "Expand filters" }));

  await user.click(screen.getByRole("button", { name: /Sort by/ }));
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
    "Name",
    "Grade",
    "Rating",
    "Ascents",
  ]);
  await user.click(screen.getByRole("option", { name: "Rating" }));
  await waitFor(() => expect(climbRequests().at(-1)).toContain("sort=rating_desc"));

  await user.click(screen.getByRole("button", { name: "Boulder", pressed: false }));
  await user.click(screen.getByRole("button", { name: /Min grade/ }));
  await user.click(await screen.findByRole("option", { name: "V4" }));
  await waitFor(() => {
    const params = new URL(climbRequests().at(-1) ?? "", "https://betabook.test").searchParams;
    expect(params.getAll("discipline")).toEqual(["boulder"]);
    expect(params.getAll("boulderRange")).toEqual(["5", String(DEFAULT_BOULDER_RANGE[1])]);
  });

  await user.click(
    within(screen.getByRole("radiogroup", { name: "Min rating" })).getByRole("radio", {
      name: "4 stars",
    }),
  );
  await waitFor(() => {
    const params = new URL(climbRequests().at(-1) ?? "", "https://betabook.test").searchParams;
    expect(params.getAll("ratingRange")).toEqual(["4", "5"]);
  });

  // A signed-out payload still carries no viewer state, so no row is marked sent.
  expect(screen.queryByText("Sent")).not.toBeInTheDocument();
});

it("hides the member notice when showMemberNotice is false and still locks climbers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ climbs: [], areas: [], areaBreadcrumbs: {}, hasNextPage: false }),
    ),
  );
  const user = userEvent.setup();
  render(<Search showMemberNotice={false} />);
  await user.click(screen.getByRole("button", { name: "Climbers" }));
  expect(screen.getByText("Sign in to view climbers.")).toBeVisible();
  expect(screen.queryByRole("region", { name: "Member content" })).not.toBeInTheDocument();
});
it("keeps the palette's sign-in link pointed at the current search", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({ climbs: [], areas: [], areaBreadcrumbs: {}, hasNextPage: false }),
    ),
  );
  const user = userEvent.setup();
  render(<Search quick />);
  const callout = screen.getByRole("region", { name: "Member content" });
  expect(screen.queryByRole("button", { name: "Expand filters" })).not.toBeInTheDocument();
  const signIn = within(callout).getByRole("link", { name: "Sign in" });
  const href = (query: string) =>
    `/sign-in?next=${encodeURIComponent(searchHref({ ...EMPTY_SEARCH, query }))}`;
  expect(signIn).toHaveAttribute("href", href("Test"));

  await user.type(screen.getByRole("combobox", { name: "Search Betabook" }), "er");
  await waitFor(() => expect(signIn).toHaveAttribute("href", href("Tester")));
});
