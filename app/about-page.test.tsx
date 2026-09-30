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

it("explains who can read trip notes", () => {
  const text = renderToStaticMarkup(<AboutPage />)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

  expect(text).toContain(
    "Your friends and anyone with your profile link can read trip notes, regardless of your journal setting.",
  );
  expect(text).not.toMatch(/read your journal can also see[^.]*trip notes/);
});

it("explains who can see trip photos and where they load from", () => {
  const text = renderToStaticMarkup(<AboutPage />)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

  expect(text).toContain("trips with their notes, photos and sends to anyone who has them");
  expect(text).toContain("can see your trips, with their photos and sends");
  expect(text).toContain("Photos load from Google Photos.");
  // The app still stores no photos.
  expect(text).toContain("doesn’t support image or video uploads");
});
