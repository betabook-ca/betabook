import { syncThemeColorMeta } from "@/lib/theme-color";

import { appBaseURL } from "./app-server";
import { expect, test } from "./story";

test.use({ baseURL: appBaseURL });

test(
  "saved theme color takes precedence over the OS defaults",
  { tag: "@app" },
  async ({ page }, info) => {
    const theme = info.project.use.colorScheme === "dark" ? "light" : "dark";
    await page.goto("/about");
    await page.evaluate((value) => localStorage.setItem("heroui-theme", value), theme);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
      "content",
      theme === "dark" ? "#000000" : "#eaf7ef",
    );
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
      "data-explicit-theme",
      "",
    );

    await page.evaluate(() => localStorage.setItem("heroui-theme", "system"));
    await page.reload();
    await expect(page.locator('meta[name="theme-color"][data-explicit-theme]')).toHaveCount(0);
    await expect(page.locator('meta[name="theme-color"][media]')).toHaveCount(2);
  },
);

test(
  "changing theme color replaces the first matching meta and System restores the defaults",
  { tag: "@app" },
  async ({ page }) => {
    await page.goto("/about");
    const defaults = await page.locator('meta[name="theme-color"][media]').evaluateAll((nodes) =>
      nodes.map((node) => ({
        media: node.getAttribute("media"),
        content: node.getAttribute("content"),
      })),
    );
    for (const theme of ["dark", "light"]) {
      await page.evaluate(syncThemeColorMeta, theme);
      await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
        "data-explicit-theme",
        "",
      );
      await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
        "content",
        theme === "dark" ? "#000000" : "#eaf7ef",
      );
      await expect(page.locator('meta[name="theme-color"][data-explicit-theme]')).toHaveCount(1);
    }
    await page.evaluate(syncThemeColorMeta, "system");
    await expect(page.locator('meta[name="theme-color"][data-explicit-theme]')).toHaveCount(0);
    expect(
      await page.locator('meta[name="theme-color"][media]').evaluateAll((nodes) =>
        nodes.map((node) => ({
          media: node.getAttribute("media"),
          content: node.getAttribute("content"),
        })),
      ),
    ).toEqual(defaults);
  },
);
