import { appBaseURL } from "./app-server";
import { auditEmailPreview } from "./email-accessibility";
import { expect, test, openStory } from "./story";

test("every coverage link resolves and the inventory distinguishes gaps", async ({
  page,
  request,
}, testInfo) => {
  await openStory(page, testInfo, "internal-coverage--inventory");
  const response = await request.get("/index.json");
  expect(response.ok()).toBe(true);
  const index = (await response.json()) as { entries: Record<string, { type: string }> };
  const links = page.getByRole("link", { name: "View example", exact: true });
  const hrefs = await links.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLAnchorElement).href),
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const id = new URL(href).searchParams.get("path")?.replace("/story/", "");
    expect(id && index.entries[id]?.type, href).toBe("story");
  }
  await page.getByRole("button", { name: "Show missing examples" }).click();
  await expect(links).toHaveCount(0);
  await expect(page.locator("li").filter({ hasText: "journal/entry-kind-step.tsx" })).toContainText(
    "Needs a story",
  );
  await expect(page.locator("li").filter({ hasText: "ui/actions-menu.tsx" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show all components" }).click();
  await page
    .locator("li")
    .filter({ hasText: "ui/actions-menu.tsx" })
    .getByRole("link", { name: "View example" })
    .click();
  await expect(page).toHaveURL(/\/\?path=\/story\/components-navigation-actions-menu--actions$/);
  await expect(
    page.frameLocator("#storybook-preview-iframe").getByRole("heading", { name: "Actions menu" }),
  ).toBeVisible();
});

test("MCP component manifest includes usable component documentation", async ({ request }) => {
  const response = await request.get("/manifests/components.json");
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    components: Record<
      string,
      { name: string; error?: unknown; stories: { id: string; snippet: string }[] }
    >;
  };
  const components = Object.values(manifest.components);
  expect(components.map((component) => component.name)).toEqual(
    expect.arrayContaining([
      "SearchSelectionField",
      "ListRow",
      "PrivacyFields",
      "ColorPage",
      "CoveragePage",
    ]),
  );
  for (const component of components) {
    expect(component.error, component.name).toBeUndefined();
    expect(component.stories.length, component.name).toBeGreaterThan(0);
    for (const story of component.stories) expect(story.snippet, story.id).toBeTruthy();
  }
  const indexResponse = await request.get("/index.json");
  expect(indexResponse.ok()).toBe(true);
  const index = (await indexResponse.json()) as {
    entries: Record<string, { id: string; type: string }>;
  };
  expect(
    components.flatMap((component) => component.stories.map((story) => story.id)).sort(),
  ).toEqual(
    Object.values(index.entries)
      .filter((entry) => entry.type === "story")
      .map((entry) => entry.id)
      .sort(),
  );
});
test(
  "tab, touch, install and social metadata point to decodable approved assets",
  { tag: "@app" },
  async ({ page, request }) => {
    await page.goto(`${appBaseURL}/about`);
    const icons = page.locator('link[rel="icon"]');
    await expect(icons).toHaveCount(2);
    const iconUrls = await icons.evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );
    expect(iconUrls.some((url) => new URL(url).pathname === "/favicon.ico")).toBe(true);
    expect(iconUrls.some((url) => new URL(url).pathname === "/icon.svg")).toBe(true);
    const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
    expect(touch).toContain("/apple-icon.png");
    const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute("href");
    if (!manifestUrl || !touch) throw new Error("Missing install metadata");
    const response = await request.get(new URL(manifestUrl, appBaseURL).href);
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.icons).toHaveLength(2);
    const social = await page.locator('meta[property="og:image"]').getAttribute("content");
    const twitter = await page.locator('meta[name="twitter:image"]').getAttribute("content");
    if (!social || !twitter) throw new Error("Missing social metadata");
    expect(new URL(social).pathname).toBe("/opengraph-image.png");
    expect(new URL(twitter).pathname).toBe("/opengraph-image.png");
    const assets = [
      ...iconUrls.map((url) => ({ url, size: 32 })),
      { url: touch, size: 180 },
      ...manifest.icons.map((icon: { src: string; sizes: string }) => ({
        url: icon.src,
        size: Number(icon.sizes.split("x")[0]),
      })),
      { url: new URL(social).pathname, size: 1200 },
    ];
    for (const { url, size } of assets) {
      const asset = await request.get(new URL(url, appBaseURL).href);
      expect(asset.ok(), url).toBe(true);
      const dimensions = await page.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      }, url);
      expect(dimensions.width, url).toBe(size);
      expect(dimensions.height, url).toBe(size === 1200 ? 630 : size);
    }
    const socialAlt = await page.locator('meta[property="og:image:alt"]').getAttribute("content");
    expect(socialAlt).toBe(
      "Betabook — Climb · Log · Progress. Climbing logbook and crag database.",
    );
  },
);

test("email accessibility checks cover the document inside the sandbox", async ({
  page,
}, testInfo) => {
  await openStory(page, testInfo, "patterns-email--contact");
  const results = await auditEmailPreview(page);
  expect(results.violations).toEqual([]);
  expect(results.passes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "document-title" }),
      expect.objectContaining({ id: "html-has-lang" }),
      expect.objectContaining({ id: "color-contrast" }),
      expect.objectContaining({ id: "image-alt" }),
      expect.objectContaining({ id: "link-name" }),
    ]),
  );
  await expect(page.locator('iframe[title="Email preview"]')).toHaveAttribute(
    "sandbox",
    "allow-same-origin",
  );
});
