import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import HomePage, { generateMetadata } from "@/app/page";
import { SearchView } from "@/app/search-view";

const state = vi.hoisted(() => ({ viewer: null as string | null }));
vi.mock("@/lib/session", () => ({
  getMemberSession: async () => (state.viewer ? { user: { id: state.viewer } } : null),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  permanentRedirect: (url: string) => {
    throw new Error(`PERMANENT:${url}`);
  },
}));
// The data half is covered where it lives (app/search/page.test.tsx).
vi.mock("@/app/search-view", () => ({ SearchView: () => null }));

beforeEach(() => {
  state.viewer = null;
});

/** The search element's props, wherever the landing page places it. */
function searchProps(node: ReactNode): Record<string, unknown> {
  for (const child of Array.isArray(node) ? node : [node]) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === SearchView) return child.props;
    if (child.props.children) {
      try {
        return searchProps(child.props.children);
      } catch {
        /* Search siblings. */
      }
    }
  }
  throw new Error("Search not rendered");
}

it("redirects members from the bare home to their journal", async () => {
  state.viewer = "reader";
  await expect(HomePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    "REDIRECT:/users/reader",
  );
});

it.each([
  [
    { mode: "climb", name: "Test", discipline: ["boulder", "trad"] },
    "/search?mode=climb&name=Test&discipline=boulder&discipline=trad",
  ],
  [{ name: "   " }, "/search?name=+++"],
])("sends every old search state %j to /search permanently, query intact", async (search, href) => {
  await expect(HomePage({ searchParams: Promise.resolve(search) })).rejects.toThrow(
    `PERMANENT:${href}`,
  );
  // Signed in or out alike: the redirect comes before any session work.
  state.viewer = "reader";
  await expect(HomePage({ searchParams: Promise.resolve(search) })).rejects.toThrow(
    `PERMANENT:${href}`,
  );
});

it("gives anonymous visitors an everything search without the member notice", async () => {
  expect(searchProps(await HomePage({ searchParams: Promise.resolve({}) }))).toEqual({
    params: {},
    viewerId: null,
    defaultCategory: "all",
    showMemberNotice: false,
  });
});

it("shows the intro with the sign-up on the bare home", async () => {
  const home = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
  expect(home).toContain('href="/climbing-logbook"');
  expect(home).toContain('href="/sign-up"');
});

it("describes the bare home and keeps search states out of the index", async () => {
  const home = await generateMetadata({ searchParams: Promise.resolve({}) });
  expect(home.alternates).toEqual({ canonical: "/" });
  expect(home.title).toContain("climbing logbook");
  expect(home.robots).toBeUndefined();
  expect(home.openGraph).toMatchObject({ url: "/", description: home.description });
  expect(await generateMetadata({ searchParams: Promise.resolve({ name: "Test" }) })).toEqual({
    title: "Search",
    robots: { index: false },
    alternates: { canonical: "/" },
  });
});
