import { expect, test, openStory } from "./story";

test("production brand stories load the correct treatment and responsive home link", async ({
  page,
}, testInfo) => {
  const theme = testInfo.project.use.colorScheme === "dark" ? "dark" : "light";
  for (const variant of ["full-lockup", "compact", "navigation"]) {
    await openStory(page, testInfo, `components-navigation-brand--${variant}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const images = page.locator("[data-brand] img:visible");
    const wideNavigation = variant === "navigation" && testInfo.project.name.startsWith("desktop");
    await expect(images).toHaveCount(wideNavigation ? 2 : 1);
    for (const image of await images.all()) {
      await expect(image).toHaveAttribute("src", new RegExp(`-${theme}\\.svg$`));
      await expect
        .poll(() =>
          image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
        )
        .toBe(true);
    }
    if (variant === "navigation") {
      const home = page.getByRole("link", { name: "Betabook home", exact: true });
      await expect(home).toHaveAttribute("href", "/");
      await expect(home).toHaveCSS("height", "48px");
      await expect(home.locator('[data-brand="icon"]')).toHaveCSS("width", "48px");
      await home.focus();
      await expect(home).toBeFocused();
      await expect(home.locator('[data-brand="wordmark"]')).toBeVisible({
        visible: wideNavigation,
      });
    } else {
      await expect(
        page.getByRole("img", {
          name: variant === "full-lockup" ? "Betabook — Climb · Log · Progress" : "Betabook",
          exact: true,
        }),
      ).toBeVisible();
    }
  }
});

test("home-screen helper uses the original compact brand", async ({ page }, testInfo) => {
  const theme = testInfo.project.use.colorScheme === "dark" ? "dark" : "light";
  await openStory(page, testInfo, `components-feedback-mobile-app-helper--instructions`);
  const helper = page.getByRole("complementary", { name: "Add Betabook to Home Screen" });
  const icon = helper.locator('[data-brand="icon"]');
  await expect(icon).toHaveCSS("width", "48px");
  await expect(icon).toHaveAttribute("aria-hidden", "true");
  await expect(icon.locator("img:visible")).toHaveAttribute("src", new RegExp(`-${theme}\\.svg$`));
});
