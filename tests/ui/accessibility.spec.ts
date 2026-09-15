import { AxeBuilder } from "@axe-core/playwright";

import { auditEmailPreview } from "./email-accessibility";
import { expect, test, openStory } from "./story";

// Deliberately bounded: lint and component tests own structural accessibility
// and behavior. These composed states cover rendered contrast and responsive fit.
const stories = [
  "patterns-forms--forms",
  "patterns-search--quick-initial",
  "components-filters-toolbar--hashtags",
  "components-journal-log-popup--send",
  "patterns-email--contact",
];
for (const story of stories) {
  test(`${story} stays accessible and fits the viewport`, async ({ page }, testInfo) => {
    await openStory(page, testInfo, story);
    // Include the initially open search overlay in the audit.
    if (story === "patterns-search--quick-initial")
      await expect(page.getByRole("dialog")).toBeVisible();
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
  });
}
