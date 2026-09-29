import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import AboutPage from "@/app/about/page";

const support = vi.hoisted(() => ({ url: null as string | null }));
vi.mock("@/lib/site", async (original) => ({
  ...(await original<typeof import("@/lib/site")>()),
  get SUPPORT_URL() {
    return support.url;
  },
}));
vi.mock("next/image", () => ({ default: () => null }));

beforeEach(() => {
  support.url = null;
});

it("links the costs sentence straight to the support page when one is set", () => {
  support.url = "https://support.example/betabook";
  const html = renderToStaticMarkup(<AboutPage />);

  expect(html).toContain(
    "The goal is to keep costs under $10/month, and if Betabook is useful to you, you can",
  );
  const link = html.match(/<a[^>]*>help cover them<\/a>/)?.[0] ?? "";
  expect(link).toContain('href="https://support.example/betabook"');
  expect(link).toContain('rel="noreferrer"');
});

it("leaves the ask out of the About page until a support page is set", () => {
  const html = renderToStaticMarkup(<AboutPage />);

  expect(html).toContain("The goal is to keep costs under $10/month.</p>");
  expect(html).not.toContain("help cover");
  expect(html).not.toContain("funding model");
});

it("says who reads a trip's notes, apart from who reads the journal", () => {
  const text = renderToStaticMarkup(<AboutPage />)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

  expect(text).toContain(
    "Trip notes are for your friends and anyone with your profile link, whatever your journal's audience is.",
  );
  expect(text).not.toMatch(/read your journal can also read[^.]*trip notes/);
});

it("says who sees a trip's photos, and where they come from", () => {
  const text = renderToStaticMarkup(<AboutPage />)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

  expect(text).toContain("trips with their notes, photos and sends to anyone who has them");
  expect(text).toContain("can see a trip, its photos and the sends inside it");
  expect(text).toContain("Photos are loaded from Google Photos.");
  // Still true: the photos are Google's to store.
  expect(text).toContain("doesn’t support image or video uploads");
});
