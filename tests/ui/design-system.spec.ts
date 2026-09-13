import { readFileSync } from "node:fs";

import { AxeBuilder } from "@axe-core/playwright";

import { auditEmailPreview } from "./email-accessibility";
import { expect, test, openStory } from "./story";

// The build is the authoritative story index. New stories inherit the same
// accessibility, viewport and screenshot checks without a separate test list.
const index = JSON.parse(readFileSync("storybook-static/index.json", "utf8")) as {
  entries: Record<string, { id: string; type: string }>;
};
const stories = Object.values(index.entries)
  .filter((entry) => entry.type === "story")
  .map((entry) => entry.id);
if (stories.length === 0) throw new Error("Storybook built no stories");
const openSearchOverlays = new Set([
  "patterns-search--quick-initial",
  "patterns-search--quick-loading",
  "patterns-search--quick-no-matches",
  "patterns-search--quick-failed",
  "patterns-search--quick-partial-failure",
]);
for (const story of stories) {
  test(`${story} stays accessible and fits the viewport`, async ({ page }, testInfo) => {
    await openStory(page, testInfo, story);
    // These stories start open. Audit the visible overlay here so a second
    // browser test does not repeat the same story setup and accessibility scan.
    if (openSearchOverlays.has(story)) await expect(page.getByRole("dialog")).toBeVisible();
    const hasEmailPreview = story.startsWith("patterns-email--");
    if (hasEmailPreview) {
      const emailResults = await auditEmailPreview(page);
      expect(emailResults.violations).toEqual([]);
    }
    const audit = new AxeBuilder({ page })
      // Email documents are audited above. Their sandbox blocks the timers axe
      // needs, which can hang a recursive scan or silently discard frame results.
      // The default Playwright driver traverses frames even with iframes: false;
      // legacy mode delegates traversal to axe, which honors that option.
      .setLegacyMode(hasEmailPreview)
      .options({ iframes: !hasEmailPreview });
    // A theme only swaps custom properties on [data-theme], so a story renders
    // the same DOM in both. Structure, names and roles therefore reach the same
    // verdict in dark as in light, and only the colour rules can differ. The
    // light projects own the full WCAG A/AA set for both viewports; dark runs
    // the rules a palette can actually break. Add a rule here if a theme ever
    // changes markup rather than colour.
    const darkTheme = testInfo.project.use.colorScheme === "dark";
    const results = await (
      darkTheme
        ? audit.withRules(["color-contrast", "link-in-text-block"])
        : audit.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    ).analyze();
    expect(results.violations).toEqual([]);
    const dimensions = await page.evaluate(() => ({
      content: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    await testInfo.attach(story, {
      body: await page.screenshot({ fullPage: true, animations: "disabled" }),
      contentType: "image/png",
    });
  });
}

test("complete brand lockups load in both color treatments", async ({ page }, testInfo) => {
  await openStory(page, testInfo, "foundations-brand-and-style--foundations");
  const logos = page.getByRole("img", {
    name: "Betabook — Climb · Log · Progress. A mountain turning into a checkmark, with a sun.",
  });
  await expect(logos).toHaveCount(2);
  for (const logo of await logos.all()) {
    await expect(logo).toBeVisible();
    await expect
      .poll(() =>
        logo.evaluate(
          (element) =>
            element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true);
    // The artwork must let the theme's paper/ink surface show through.
    const cornerAlpha = await logo.evaluate((element) => {
      if (!(element instanceof HTMLImageElement)) throw new Error("Expected logo image");
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.drawImage(element, 0, 0);
      return context.getImageData(0, 0, 1, 1).data[3];
    });
    expect(cornerAlpha).toBe(0);
  }
  for (const [theme, token] of [
    ["light", "--palette-paper"],
    ["dark", "--palette-ink"],
  ]) {
    const panel = page.getByTestId(`logo-${theme}`);
    const expectedColor = await panel.evaluate((element, paletteToken) => {
      const probe = document.createElement("span");
      probe.style.backgroundColor = `var(${paletteToken})`;
      element.appendChild(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    }, token);
    await expect(panel).toHaveCSS("background-color", expectedColor);
  }
});

test("shared panel geometry and typography stay consistent", async ({ page }, testInfo) => {
  await openStory(page, testInfo, "foundations-tokens--geometry");
  for (const [size, padding] of [
    ["sm", "16px"],
    ["md", "24px"],
    ["fluid", testInfo.project.name.startsWith("mobile") ? "16px" : "24px"],
  ]) {
    const panel = page
      .locator(`[data-token="cardClass(${size}) · padding"]`)
      .getByText("Panel content");
    await expect(panel).toHaveCSS("padding", padding);
    await expect(panel).toHaveCSS("border-radius", "12px");
    await expect(panel).toHaveCSS("box-shadow", "none");
  }
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveCSS("font-family", /barlow/i);
  await expect(heading).toHaveCSS("font-size", "30px");
  await expect(heading).toHaveCSS("font-weight", "600");
});

for (const panel of [
  {
    name: "feed card",
    story: "components-journal-feed-day-card--activity-feed",
    selector: "article",
  },
  {
    name: "empty state",
    story: "components-feedback-empty-state--no-results",
    selector: "div.border-dashed",
  },
  {
    name: "mobile helper",
    story: "components-feedback-mobile-app-helper--instructions",
    selector: "aside",
  },
  {
    name: "loading card",
    story: "components-feedback-skeleton--stat-card",
    selector: ".bg-surface-secondary",
  },
]) {
  test(`${panel.name} follows the shared panel radius`, async ({ page }, testInfo) => {
    await openStory(page, testInfo, panel.story);
    const surface = page.locator(panel.selector);
    await expect(surface).toHaveCount(1);
    await expect(surface).toHaveCSS("border-radius", "12px");
    // A theme-token change must reach real feature surfaces, not just the
    // card helper example. This catches a local hard-coded radius override.
    await page.evaluate(() => document.documentElement.style.setProperty("--radius-panel", "20px"));
    await expect(surface).toHaveCSS("border-radius", "20px");
  });
}

test("native selects match HeroUI fields and keyboard focus is visible", async ({
  page,
}, testInfo) => {
  await openStory(page, testInfo, "patterns-forms--forms");
  const input = page.getByRole("textbox", { name: "Climb name" });
  const select = page.getByLabel("Discipline", { exact: true });
  const fieldRadius = await input.evaluate((element) => getComputedStyle(element).borderRadius);
  await expect(select).toHaveCSS("border-radius", fieldRadius);
  await expect(input).toHaveValue("Cedar Arete");
  await input.focus();
  await page.keyboard.press("Tab");
  await expect(select).toBeFocused();
  // HeroUI paints field focus with a two-pixel ring (box shadow), not an outline.
  await expect(select).toHaveCSS("box-shadow", /0px 0px 0px 2px/);
  await expect(page.getByRole("textbox", { name: "Comment", exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByRole("textbox", { name: "Unavailable field" })).toBeDisabled();
});

test("delete dialog supports keyboard cancellation and explicit confirmation", async ({
  page,
}, testInfo) => {
  await openStory(page, testInfo, "components-feedback-confirm-delete-dialog--delete-confirmation");
  const trigger = page.getByRole("button", { name: "Delete sample send" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Delete this send?");
  const results = await new AxeBuilder({ page })
    .include('[role="alertdialog"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  // Alert dialogs intentionally require an explicit choice; HeroUI disables
  // Escape dismissal by default. Cancel must remain keyboard-accessible.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Sample send is saved.");
  await trigger.click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toHaveText("Sample send deleted.");
  await expect(trigger).toBeDisabled();
});

test("palette documentation follows live CSS token changes", async ({ page }, testInfo) => {
  await openStory(page, testInfo, "foundations-tokens--palette");
  const paper = page.locator('[data-token="--palette-paper"]');
  await expect(paper.locator("output")).not.toBeEmpty();
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--palette-paper", "rgb(240, 230, 210)"),
  );
  await expect(paper.locator('[aria-hidden="true"]')).toHaveCSS(
    "background-color",
    "rgb(240, 230, 210)",
  );
  await expect(paper.locator("output")).toHaveText("rgb(240, 230, 210)");
});

test("area lookup supports keyboard selection and empty results", async ({ page }, testInfo) => {
  await openStory(page, testInfo, "components-search-area-lookup--selection");
  const input = page.getByRole("combobox", { name: "Area", exact: true });
  await input.fill("cedar");
  await expect(page.getByRole("option", { name: /Cedar Grove.*California/ })).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await input.press("Tab");
  await expect(page.getByLabel("Selected area identity")).toHaveText("1");
  await input.fill("zzz");
  await expect(page.getByText("No matches.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Selected area identity")).toHaveText("None");
});

test("actions menu keeps actions local and returns focus", async ({ page }, testInfo) => {
  await openStory(page, testInfo, "components-navigation-actions-menu--actions");
  const trigger = page.getByRole("button", { name: "Sample climb actions" });
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  const result = await new AxeBuilder({ page })
    .include('[role="menu"]')
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
  await page.getByRole("menuitem", { name: "Edit climb" }).click();
  await expect(page.getByRole("status")).toHaveText("Action: edit");
  await expect(trigger).toBeFocused();
});

test("long comments reveal the clipped text and collapse back to two lines", async ({
  page,
}, testInfo) => {
  await openStory(page, testInfo, "components-data-display-clamped-comment--long");
  const expand = page.getByRole("button", { name: "Show more" });
  const id = await expand.getAttribute("aria-controls");
  expect(id).toBeTruthy();
  const paragraph = page.locator(`[id="${id}"]`);
  const collapsed = await paragraph.evaluate((node) => ({
    height: node.clientHeight,
    full: node.scrollHeight,
  }));
  expect(collapsed.full).toBeGreaterThan(collapsed.height + 1);
  await expand.press("Enter");
  const collapse = page.getByRole("button", { name: "Show less" });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(() => paragraph.evaluate((node) => node.clientHeight))
    .toBeGreaterThan(collapsed.height);
  expect(
    await paragraph.evaluate((node) => node.scrollHeight - node.clientHeight),
  ).toBeLessThanOrEqual(1);
  await collapse.press("Enter");
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect.poll(() => paragraph.evaluate((node) => node.clientHeight)).toBe(collapsed.height);
  await openStory(page, testInfo, "components-data-display-clamped-comment--short");
  await expect(page.getByText("A short note.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
});
