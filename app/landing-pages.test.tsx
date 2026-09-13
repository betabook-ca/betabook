import { env } from "cloudflare:test";
import type { Metadata } from "next";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import { metadata as aboutMetadata } from "@/app/about/page";
import ClimbingLogbookPage, { metadata as logbookMetadata } from "@/app/climbing-logbook/page";
import { metadata as contactMetadata } from "@/app/contact/page";
import KayaImportPage, { metadata as kayaMetadata } from "@/app/kaya-import/page";
import MountainProjectImportPage, {
  metadata as mountainProjectMetadata,
} from "@/app/mountain-project-import/page";
import SendageImportPage, { metadata as sendageMetadata } from "@/app/sendage-import/page";
import sitemap from "@/app/sitemap";
import { createDb } from "@/db/client";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";
import { seedFixtureTree } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

vi.mock("next/link", () => ({
  default: ({
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props}>{props.children}</a>,
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const PUBLIC_PAGES: [string, Metadata][] = [
  ["/about", aboutMetadata],
  ["/contact", contactMetadata],
  ["/climbing-logbook", logbookMetadata],
  ["/kaya-import", kayaMetadata],
  ["/sendage-import", sendageMetadata],
  ["/mountain-project-import", mountainProjectMetadata],
];
const IMPORT_PAGES = [
  ["/kaya-import", KayaImportPage],
  ["/sendage-import", SendageImportPage],
  ["/mountain-project-import", MountainProjectImportPage],
] as const;

const db = createDb(env.DB);
beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
});

it.each(PUBLIC_PAGES)(
  "gives %s its own canonical, description, and social card",
  (path, metadata) => {
    expect(metadata.alternates).toEqual({ canonical: path });
    expect(metadata.description).toBeTruthy();
    expect(metadata.description).not.toBe(SITE_DESCRIPTION);
    expect(metadata.openGraph).toMatchObject({ url: path, description: metadata.description });
    expect(metadata.twitter).toMatchObject({ description: metadata.description });
  },
);

it("titles each public page distinctly", () => {
  const titles = PUBLIC_PAGES.map(([, metadata]) => metadata.title);
  expect(new Set(titles).size).toBe(PUBLIC_PAGES.length);
});

it("lists every public page in the first sitemap shard", async () => {
  const urls = (await sitemap({ id: Promise.resolve("0") })).map((entry) => entry.url);
  for (const [path] of PUBLIC_PAGES) expect(urls).toContain(`${SITE_URL}${path}`);
  expect(urls).toContain(`${SITE_URL}/areas/1/test-crag`);
});

it.each(IMPORT_PAGES)(
  "links %s to sign-up, the importer, the logbook page and the other import pages",
  (path, Page) => {
    const html = renderToStaticMarkup(<Page />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('href="/sign-up?next=%2Faccount%2Fimport"');
    expect(html).toContain('href="/account/import"');
    expect(html).toContain('href="/climbing-logbook"');
    for (const [other] of IMPORT_PAGES) {
      expect(html.includes(`href="${other}"`)).toBe(other !== path);
    }
  },
);

it("links the logbook page to sign-up and every import page without linking sample climbs", () => {
  const html = renderToStaticMarkup(<ClimbingLogbookPage />);
  expect(html.match(/<h1/g)).toHaveLength(1);
  expect(html).toContain('href="/sign-up"');
  for (const [path] of IMPORT_PAGES) expect(html).toContain(`href="${path}"`);
  expect(html).toContain("Sample data from a fictional climber.");
  expect(html).not.toMatch(/href="\/(climbs|areas)\//);
});
