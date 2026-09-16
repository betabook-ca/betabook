import { AxeBuilder } from "@axe-core/playwright";

import { expect, openStory, test } from "./story";

for (const story of ["secondary-tools", "primary-fallback", "signed-out"]) {
  test(`compact mobile menu fits, supports touch and restores focus: ${story}`, async ({
    page,
  }, info) => {
    await openStory(page, info, `components-navigation-mobile-menu--${story}`);
    const trigger = page.getByRole("button", { name: "Open menu" });
    await trigger.click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu).toBeVisible();
    await expect(page.locator(".popover")).not.toHaveAttribute("data-entering", "true");
    await expect(menu.locator("[data-brand]")).toHaveCount(0);
    await expect(menu.getByRole("button", { name: "Sign out" })).toHaveCount(0);
    const links = menu.getByRole("link");
    // Members get Find climbs, Add climb or area, Tutorials and Account settings; the
    // fallback menu adds the three primary destinations; guests see sign in and sign up.
    await expect(links).toHaveCount(
      story === "primary-fallback" ? 7 : story === "secondary-tools" ? 4 : 2,
    );
    if (story !== "signed-out")
      await expect(
        menu.getByRole("link", { name: "Account settings", exact: true }),
      ).toHaveAttribute("href", "/account");
    for (const link of await links.all()) {
      const bounds = await link.boundingBox();
      if (!bounds) throw new Error("Missing menu destination");
      expect(bounds.height).toBeGreaterThanOrEqual(48);
    }
    const bounds = await menu.boundingBox();
    if (!bounds) throw new Error("Missing menu bounds");
    expect(bounds.width).toBeLessThanOrEqual(280);
    // Four 48px secondary rows for members, two for guests; the fallback menu is taller.
    if (story !== "primary-fallback") expect(bounds.height).toBeLessThan(250);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.setViewportSize({ width: 375, height: 320 });
    await trigger.click();
    const last = menu.getByRole("link").last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });
}
