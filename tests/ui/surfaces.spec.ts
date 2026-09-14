import type { Page } from "@playwright/test";

import { expect, test, openStory } from "./story";

async function tokenColor(page: Page, token: string) {
  return page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = `var(${name})`;
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, token);
}

test("surface rules: responsive recipes separate insets and floating elevation", async ({
  page,
}, testInfo) => {
  await openStory(page, testInfo, "patterns-layout-and-feedback--surface-treatments");
  const quiet = page.getByRole("region", { name: "Quiet panel", exact: true });
  const inset = page.getByLabel("Nested content", { exact: true });
  const bordered = page.getByRole("region", { name: "Bordered panel", exact: true });
  const floating = page.getByRole("region", { name: "Floating panel", exact: true });
  for (const [surface, token, border] of [
    [quiet, "--surface-secondary", "0px"],
    [inset, "--surface-tertiary", "0px"],
    [bordered, "--surface", "1px"],
  ] as const) {
    await expect(surface).toHaveCSS("background-color", await tokenColor(page, token));
    await expect(surface).toHaveCSS("border-top-width", border);
    await expect(surface).toHaveCSS("box-shadow", "none");
  }
  await expect(quiet).toHaveCSS(
    "padding",
    (page.viewportSize()?.width ?? 1024) < 640 ? "16px" : "24px",
  );
  await expect(inset).toHaveCSS("padding", "16px");
  await expect(bordered).toHaveCSS("padding", "16px");
  await expect(floating).toHaveCSS("background-color", await tokenColor(page, "--overlay"));
  await expect(floating).toHaveCSS("border-top-width", "1px");
  await expect(floating).not.toHaveCSS("box-shadow", "none");
  await expect(floating).toHaveCSS("backdrop-filter", "none");
  // A live role change must propagate through the recipe without a local fill override.
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--surface-tertiary", "rgb(140, 150, 160)"),
  );
  await expect(inset).toHaveCSS("background-color", "rgb(140, 150, 160)");
});

test("surface rules: tutorial feed matches production", async ({ page }, testInfo) => {
  await openStory(page, testInfo, "components-journal-feed-activity-card--single-send");
  const card = page.getByRole("article");
  const styles = await card.evaluate((el) => {
    const css = getComputedStyle(el);
    return {
      fill: css.backgroundColor,
      border: css.border,
      padding: css.padding,
      shadow: css.boxShadow,
    };
  });
  const headerPadding = await card.locator("header").evaluate((el) => getComputedStyle(el).padding);
  await openStory(page, testInfo, "components-tutorials-social-previews--feed");
  await expect(page.getByRole("article")).toHaveCount(3);
  for (const sample of await page.getByRole("article").all()) {
    await expect(sample).toHaveCSS("background-color", styles.fill);
    await expect(sample).toHaveCSS("border", styles.border);
    await expect(sample).toHaveCSS("padding", styles.padding);
    await expect(sample).toHaveCSS("box-shadow", styles.shadow);
    await expect(sample.locator("header")).toHaveCSS("padding", headerPadding);
  }
});

test("surface rules: account loading includes settings and semantic danger panel", async ({
  page,
}, testInfo) => {
  await openStory(page, testInfo, "patterns-layout-and-feedback--account-placeholder");
  const cards = page.locator(".rounded-panel");
  await expect(cards).toHaveCount(6);
  const danger = cards.last();
  const expected = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "color-mix(in oklab, var(--danger) 5%, transparent)";
    probe.style.borderColor = "color-mix(in oklab, var(--danger) 30%, transparent)";
    document.body.appendChild(probe);
    const css = getComputedStyle(probe);
    const result = { fill: css.backgroundColor, border: css.borderTopColor };
    probe.remove();
    return result;
  });
  await expect(danger).toHaveCSS("background-color", expected.fill);
  await expect(danger).toHaveCSS("border-top-color", expected.border);
});

test("surface rules: feed loading reserves bordered activity cards", async ({ page }, testInfo) => {
  await openStory(page, testInfo, "patterns-layout-and-feedback--feed-placeholder");
  const cards = page.getByRole("status", { name: "Loading feed" }).locator(".rounded-panel");
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    await expect(card).toHaveCSS("background-color", await tokenColor(page, "--surface"));
    await expect(card).toHaveCSS("border-top-width", "1px");
    await expect(card).toHaveCSS("padding", "0px");
    await expect(card.locator(":scope > div").first()).toHaveCSS("padding", "12px 16px 8px");
  }
});

for (const panel of [
  {
    name: "feed boundary",
    story: "components-journal-feed-activity-card--single-send",
    selector: "article",
    fill: "--surface",
    border: "1px",
    padding: "0px",
  },
  {
    name: "nested instructions",
    story: "components-feedback-mobile-app-helper--instructions",
    selector: "aside > div:nth-child(2)",
    fill: "--surface-tertiary",
    border: "0px",
    padding: "16px",
  },
]) {
  test(`surface rules: ${panel.name}`, async ({ page }, testInfo) => {
    await openStory(page, testInfo, panel.story);
    const surface = page.locator(panel.selector);
    await expect(surface).toHaveCount(1);
    await expect.soft(surface).toHaveCSS("background-color", await tokenColor(page, panel.fill));
    await expect.soft(surface).toHaveCSS("border-top-width", panel.border);
    if (panel.border === "1px") {
      await expect.soft(surface).toHaveCSS("border-top-color", await tokenColor(page, "--border"));
    }
    await expect.soft(surface).toHaveCSS("padding", panel.padding);
    await expect(surface).toHaveCSS("box-shadow", "none");
    await expect(surface).toHaveCSS("border-radius", "12px");
    await page.screenshot({
      path: testInfo.outputPath("surface.png"),
      fullPage: true,
      animations: "disabled",
    });
  });
}
