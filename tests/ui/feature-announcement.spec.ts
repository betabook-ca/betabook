import { expect, openStory, test } from "./story";

// Include classic scrollbars, as used by the in-app browser on macOS.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

for (const story of [
  "components-feature-callout--default",
  "components-feature-callout--near-right-edge",
]) {
  test(`${story} keeps its callout and touch target within the viewport`, async ({
    page,
  }, info) => {
    await openStory(page, info, story);
    const callout = page.getByRole("region", { name: "Your journal, organized" });
    await expect(callout).toBeVisible();
    const bounds = await callout.boundingBox();
    expect(bounds).not.toBeNull();
    const viewport = page.viewportSize();
    if (!bounds || !viewport) throw new Error("Missing callout or viewport bounds");
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    const close = page.getByRole("button", { name: /Dismiss announcement:/ });
    const closeBounds = await close.boundingBox();
    if (!closeBounds) throw new Error("Missing dismiss button bounds");
    expect(closeBounds.width).toBeGreaterThanOrEqual(44);
    expect(closeBounds.height).toBeGreaterThanOrEqual(44);
  });
}

test("dismissal is reachable with touch and keyboard", async ({ page }, info) => {
  await openStory(page, info, "components-feature-announcement--undismissed");
  const close = page.getByRole("button", { name: /Dismiss announcement:/ });
  if (info.project.use.hasTouch) await close.tap();
  else {
    for (
      let i = 0;
      i < 10 && !(await close.evaluate((element) => element === document.activeElement));
      i += 1
    )
      await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Enter");
  }
  await expect(close).toBeHidden();
  await expect(page.getByRole("button", { name: "Journal tags" })).toBeVisible();
});

test("analytics announcement fits the screen and leaves Customize usable", async ({
  page,
}, info) => {
  await openStory(page, info, "components-charts-analytics-dashboard--customize-announcement");
  const callout = page.getByRole("region", { name: "Make Analytics your own" });
  await expect(callout).toBeVisible();
  const bounds = await callout.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error("Missing announcement bounds");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  const customize = page.getByRole("button", { name: "Customize dashboard" });
  if (info.project.use.hasTouch) await customize.tap();
  else await customize.click();
  await expect(page.getByRole("heading", { name: "Customize dashboard" })).toBeVisible();
});

test.describe("visible scrollbar layout", () => {
  test("callout fits the usable viewport beside a scrollbar", async ({ page }, info) => {
    // Apply the browser's scrollbar condition before the overlay is positioned.
    await page.route("**/iframe.html?**", async (route) => {
      const response = await route.fetch();
      const html = await response.text();
      await route.fulfill({
        response,
        body: html.replace(
          "<head>",
          "<head><style>html { overflow-y: scroll; } ::-webkit-scrollbar { width: 15px; }</style>",
        ),
      });
    });
    await openStory(page, info, "components-feature-callout--near-right-edge");
    const viewport = await page.evaluate(() => ({
      usable: document.documentElement.clientWidth,
      outer: window.innerWidth,
    }));
    expect(viewport.usable).toBeLessThan(viewport.outer);
    const callout = page.getByRole("region", { name: "Your journal, organized" });
    const bounds = await callout.boundingBox();
    if (!bounds) throw new Error("Missing callout bounds");
    // Include the callout's 16px right padding, not just its content region.
    expect(bounds.x + bounds.width + 16).toBeLessThanOrEqual(viewport.usable);
  });
});

test("the next release anchors to its own target on a later visit", async ({ page }, info) => {
  await openStory(page, info, "patterns-feature-announcements--joined-after-third-launch");
  const dismiss = page.getByRole("button", { name: "Dismiss announcement: Partner summaries" });
  if (info.project.use.hasTouch) await dismiss.tap();
  else await dismiss.click();
  const revisit = page.getByRole("button", { name: "Revisit page" });
  if (info.project.use.hasTouch) await revisit.tap();
  else await revisit.click();
  const panel = page.getByRole("region", { name: "Flash charts" }).locator("..");
  await expect(panel).toBeVisible();
  const bounds = await panel.boundingBox();
  const target = await page.getByRole("button", { name: "Feature 5: Flash charts" }).boundingBox();
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: window.innerHeight,
  }));
  if (!bounds || !target) throw new Error("Missing announcement or target bounds");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  const placement = await panel.getAttribute("data-placement");
  expect(placement).toMatch(/^(top|bottom)$/);
  if (placement === "top") expect(bounds.y + bounds.height).toBeLessThanOrEqual(target.y);
  else expect(bounds.y).toBeGreaterThanOrEqual(target.y + target.height);
});
