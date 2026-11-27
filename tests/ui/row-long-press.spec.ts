import type { Page } from "@playwright/test";

import { expect, openStory, test } from "./story";

/** A row's edit button ends its status line: always visible at tap size on
 * touch screens, where a long press anywhere on the row is a shortcut to the
 * same menu, and revealed on hover on pointer screens. Needs real touch input
 * and the `pointer: coarse` media query. */

const STORY = "components-journal-climb-log-row--with-actions";

async function hold(page: Page, point: { x: number; y: number }, ms: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await page.waitForTimeout(ms);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("a long press on a send row opens its actions where the finger is @layout", async ({
  page,
}, info) => {
  await openStory(page, info, STORY);
  const trigger = page.getByRole("button", { name: "Send actions" });

  const status = page.getByText("Flash", { exact: true });
  const [triggerBox, statusBox] = await Promise.all([trigger.boundingBox(), status.boundingBox()]);
  if (!triggerBox || !statusBox) throw new Error("Missing send row bounds");
  expect(
    Math.abs(triggerBox.y + triggerBox.height / 2 - statusBox.y - statusBox.height / 2),
  ).toBeLessThanOrEqual(2);

  if (!info.project.use.hasTouch) {
    await expect(trigger).toHaveCSS("width", "32px");
    await expect(trigger).toHaveCSS("opacity", "0");
    await page.locator("article").hover();
    await expect(trigger).toHaveCSS("opacity", "1");
    return;
  }

  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveCSS("width", "44px");
  const title = page.getByRole("link", { name: "Cedar Arete", exact: true });
  const box = await title.boundingBox();
  if (!box) throw new Error("Missing send row bounds");
  const point = { x: box.x + box.width + 40, y: box.y + 40 };
  const url = page.url();

  await hold(page, point, 50);
  await expect(page.getByRole("menu")).toHaveCount(0);

  await hold(page, point, 700);
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  expect(page.url()).toBe(url);
  const menuBox = await menu.boundingBox();
  if (!menuBox) throw new Error("Missing menu bounds");
  expect(menuBox.y).toBeGreaterThanOrEqual(point.y);
  expect(menuBox.y - point.y).toBeLessThanOrEqual(24);
  expect(menuBox.x).toBeLessThanOrEqual(point.x);
  expect(menuBox.x + menuBox.width).toBeGreaterThanOrEqual(point.x);

  await menu.getByRole("menuitem", { name: "Edit" }).tap();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("dragging across a row scrolls rather than opening its actions @layout", async ({
  page,
}, info) => {
  test.skip(!info.project.use.hasTouch, "Touch only");
  await openStory(page, info, STORY);
  const box = await page.getByRole("link", { name: "Cedar Arete", exact: true }).boundingBox();
  if (!box) throw new Error("Missing send row bounds");
  const cdp = await page.context().newCDPSession(page);
  const start = { x: box.x + 20, y: box.y + 40 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: start.x, y: start.y + 40 }],
  });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.getByRole("menu")).toHaveCount(0);
});
