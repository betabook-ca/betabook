import { expect, openStory, test } from "./story";

/** Send videos add two things jsdom can't measure: a row of posters that has
 * to scroll inside itself rather than widen the page on a phone, and a
 * player framed to the clip's shape within the screen it opens on. The
 * players themselves are third-party frames, so their hosts are blocked here:
 * these tests are about Betabook's own layout, not YouTube's. */

test.beforeEach(async ({ page }) => {
  await page.route(
    /^https:\/\/([\w-]+\.)*(youtube(-nocookie)?\.com|ytimg\.com|instagram\.com)\//,
    (route) => route.abort(),
  );
});

test("a climb's video row scrolls within itself and never widens the page @layout", async ({
  page,
}, info) => {
  await openStory(page, info, "components-climbs-climb-videos--several");

  const list = page.getByRole("region", { name: "Videos" }).getByRole("list");
  const { scrollWidth, clientWidth, pageOverflow } = await list.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));

  expect(pageOverflow).toBeLessThanOrEqual(0);
  // Three 240px tiles don't fit a phone: the row itself takes the overflow.
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Missing viewport");
  if (viewport.width < 768) expect(scrollWidth).toBeGreaterThan(clientWidth);
});

test("a Short opens from its row in a portrait player that fits the screen @layout", async ({
  page,
}, info) => {
  await openStory(page, info, "components-journal-climb-log-row--with-video");

  await page.getByRole("button", { name: /^Watch YouTube Short/ }).click();

  const dialog = page.getByRole("dialog", { name: "Cedar Arete" });
  await expect(dialog).toBeVisible();
  const frame = await dialog.locator("iframe").boundingBox();
  const viewport = page.viewportSize();
  if (!frame || !viewport) throw new Error("Missing player or viewport bounds");
  expect(frame.height).toBeGreaterThan(frame.width * 1.5);
  expect(frame.x).toBeGreaterThanOrEqual(0);
  expect(frame.x + frame.width).toBeLessThanOrEqual(viewport.width);
});

test("a send's several posters scroll within their row and never widen the page @layout", async ({
  page,
}, info) => {
  await openStory(page, info, "components-sends-send-video--several-videos");

  const { scrollWidth, clientWidth, pageOverflow } = await page
    .getByRole("list")
    .evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));

  expect(pageOverflow).toBeLessThanOrEqual(0);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Missing viewport");
  // Four posters one row high don't fit a phone: the row takes the overflow.
  if (viewport.width < 768) expect(scrollWidth).toBeGreaterThan(clientWidth);
});
