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
vi.mock("next/link", () => ({
  default: ({
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props}>{props.children}</a>,
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
