import { appBaseURL } from "./app-server";
import { expect, test } from "./story";

// These checks exercise Next's real metadata and app shell alongside the gallery.
test.use({ baseURL: appBaseURL });

test(
  "production branding loads and fits navigation and About",
  { tag: "@app" },
  async ({ page }, testInfo) => {
    await page.goto("/about");
    await expect(page.getByRole("banner")).toBeVisible();
    const home = page.getByRole("link", { name: "Betabook home", exact: true });
    const mobile = testInfo.project.name.startsWith("mobile");
    const search = page.getByRole("banner").getByRole("link", { name: "Search", exact: true });
    if (mobile) {
      await expect(home).toBeHidden();
      await expect(search.locator('[data-brand="icon"]')).toBeVisible();
      await expect(search).toHaveCSS("height", "44px");
      const searchBox = await search.boundingBox();
      if (!searchBox) throw new Error("Missing mobile search");
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(searchBox.width).toBeGreaterThan(180);
      expect(searchBox.x + searchBox.width / 2).toBeCloseTo(viewportWidth / 2, 0);
    } else {
      await expect(
        page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await expect(home).toBeVisible();
      await expect(home.locator('[data-brand="wordmark"]')).toBeVisible();
      await expect(home.locator('[data-brand="icon"]')).toBeVisible();
      await expect(home).toHaveCSS("height", "40px");
      await expect(search).toHaveCSS("height", "40px");
      const searchBox = await search.boundingBox();
      const headerBox = await page.getByRole("banner").locator(":scope > div").boundingBox();
      if (!searchBox || !headerBox) throw new Error("Missing desktop header bounds");
      expect(searchBox.x + searchBox.width / 2).toBeCloseTo(headerBox.x + headerBox.width / 2, 0);
    }
    const lockup = page.getByRole("img", {
      name: "Betabook — Climb · Log · Progress",
      exact: true,
    });
    await expect(lockup).toBeVisible();
    const visibleImages = page.locator("[data-brand] img:visible");
    await expect(visibleImages).toHaveCount(mobile ? 2 : 3);
    for (const image of await visibleImages.all()) {
      await expect
        .poll(() =>
          image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
        )
        .toBe(true);
      await expect(image).toHaveAttribute(
        "src",
        new RegExp(`-${testInfo.project.use.colorScheme}(?:[.-][^/]*)?\\.svg$`),
      );
    }
    const box = await lockup.boundingBox();
    if (!box) throw new Error("Missing logo bounds");
    expect(box.width).toBeLessThanOrEqual(360);
    expect(box.width / box.height).toBeCloseTo(500 / 320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    // A theme saved in Account settings overrides the OS scheme from first paint.
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => localStorage.setItem("heroui-theme", value), theme);
      await page.reload();
      await expect(lockup.locator("img:visible")).toHaveAttribute(
        "src",
        new RegExp(`-${theme}\\.svg$`),
      );
    }
    // The brand goes home; the guest search control opens the Find climbs page.
    await (mobile ? search : home).click();
    await expect(page).toHaveURL(mobile ? "/search" : "/");
  },
);

test(
  "the footer colophon carries the wordmark's tagline as text",
  { tag: "@app" },
  async ({ page }) => {
    await page.goto("/about");
    const colophon = page.getByRole("contentinfo");
    await expect(colophon).toContainText(/© \d{4} Betabook — Climb · Log · Progress/);
    await expect(colophon.getByRole("link", { name: "About" })).toBeVisible();
    await expect(colophon.getByRole("link", { name: "Contact us" })).toBeVisible();
    // Unbroken at every width — the line wraps before the tagline, not at a middle dot.
    expect(
      await colophon
        .getByText("Climb · Log · Progress")
        .evaluate((node) => node.getClientRects().length),
    ).toBe(1);
  },
);
