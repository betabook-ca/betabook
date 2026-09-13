import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Audit the rendered email without running axe's async callbacks in its scriptless sandbox. */
export async function auditEmailPreview(page: Page) {
  const preview = page.locator('iframe[title="Email preview"]');
  const email = page.frameLocator('iframe[title="Email preview"]');
  await email.getByRole("heading", { level: 1 }).waitFor();
  await expect
    .poll(() => preview.evaluate((node: HTMLIFrameElement) => node.contentDocument?.readyState))
    .toBe("complete");
  const html = await preview.getAttribute("srcdoc");
  const size = await preview.boundingBox();
  if (!html || !size) throw new Error("Expected a rendered email preview");

  // Keep the real email markup, styles, assets, and frame viewport. The gallery
  // audit still checks the iframe element; this page checks its complete document.
  const emailPage = await page.context().newPage();
  try {
    await emailPage.setViewportSize({
      width: Math.round(size.width),
      height: Math.round(size.height),
    });
    await emailPage.setContent(html);
    await emailPage.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => image.decode()));
    });
    return await new AxeBuilder({ page: emailPage })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
  } finally {
    await emailPage.close();
  }
}
