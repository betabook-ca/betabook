import { appBaseURL } from "./app-server";
import { expect, test } from "./story";

// These checks exercise Next's real metadata and app shell alongside the gallery.
test.use({ baseURL: appBaseURL });

test(
  "production branding loads and fits navigation and About",
  { tag: "@app" },
  async ({ page }, testInfo) => {
    await page.goto("/about");
    const home = page.getByRole("link", { name: "Betabook home", exact: true });
    await expect(home).toBeVisible();
    const lockup = page.getByRole("img", {
      name: "Betabook — Climb · Log · Progress",
      exact: true,
    });
    await expect(lockup).toBeVisible();
    const wordmark = home.locator('[data-brand="wordmark"]');
    if (testInfo.project.name.startsWith("mobile")) await expect(wordmark).toBeHidden();
    else await expect(wordmark).toBeVisible();
    await expect(home).toHaveCSS("height", "48px");
    const visibleImages = page.locator("[data-brand] img:visible");
    await expect(visibleImages).toHaveCount(testInfo.project.name.startsWith("mobile") ? 2 : 3);
    for (const image of await visibleImages.all()) {
      await expect
        .poll(() =>
          image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
        )
        .toBe(true);
      await expect(image).toHaveAttribute(
        "src",
        new RegExp(`-${testInfo.project.use.colorScheme}\\.svg$`),
      );
    }
    const box = await lockup.boundingBox();
    if (!box) throw new Error("Missing logo bounds");
    expect(box.width).toBeLessThanOrEqual(360);
    expect(box.width / box.height).toBeCloseTo(500 / 320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await testInfo.attach("about-branding", {
      body: await page.screenshot({
        fullPage: false,
        animations: "disabled",
        path: testInfo.outputPath("about-branding.png"),
      }),
      contentType: "image/png",
    });
    // Explicit app choices override the OS scheme and survive a reload.
    await page.getByRole("button", { name: "Theme: system. Switch to light." }).click();
    await expect(lockup.locator("img:visible")).toHaveAttribute("src", /-light\.svg$/);
    await page.getByRole("button", { name: "Theme: light. Switch to dark." }).click();
    await expect(lockup.locator("img:visible")).toHaveAttribute("src", /-dark\.svg$/);
    await page.reload();
    await expect(lockup.locator("img:visible")).toHaveAttribute("src", /-dark\.svg$/);
    await home.click();
    await expect(page).toHaveURL("/");
  },
);

test(
  "the footer colophon carries the wordmark's tagline as text",
  { tag: "@app" },
  async ({ page }, testInfo) => {
    await page.goto("/about");
    const colophon = page.getByRole("contentinfo");
    await expect(colophon).toContainText(/© \d{4} Betabook — Climb · Log · Progress/);
    await expect(colophon.getByRole("link", { name: "About" })).toBeVisible();
    await expect(colophon.getByRole("link", { name: "Contact" })).toBeVisible();
    // Unbroken at every width — the line wraps before the tagline, not at a middle dot.
    expect(
      await colophon
        .getByText("Climb · Log · Progress")
        .evaluate((node) => node.getClientRects().length),
    ).toBe(1);
    await testInfo.attach("footer-colophon", {
      body: await colophon.screenshot({
        animations: "disabled",
        path: testInfo.outputPath("footer-colophon.png"),
      }),
      contentType: "image/png",
    });
  },
);
