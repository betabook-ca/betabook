import type { Locator } from "@playwright/test";

import { expect, openStory, test } from "./story";

/** The paragraph a Show more/less toggle names in `aria-controls`. */
async function controlledBy(toggle: Locator): Promise<Locator> {
  const id = await toggle.getAttribute("aria-controls");
  expect(id).toBeTruthy();
  return toggle.page().locator(`[id="${id}"]`);
}

test(
  "comment updates recheck truncation even when the clamped height stays unchanged",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-data-display-clamped-comment--updated-comment");
    const expand = page.getByRole("button", { name: "Show more", exact: true });
    await expect(expand).toHaveCount(0);
    const paragraph = page.getByText(
      "Found a new sequence at the crux and linked all of the moves.",
      { exact: true },
    );
    const initialHeight = await paragraph.evaluate((element) => element.clientHeight);
    await page.getByRole("button", { name: "Lengthen comment" }).click();
    await expect(expand).toBeVisible();
    const note = await controlledBy(expand);
    await expect.poll(() => note.evaluate((element) => element.clientHeight)).toBe(initialHeight);
    await expect
      .poll(() => note.evaluate((element) => element.scrollHeight))
      .toBeGreaterThan(initialHeight);
    await expand.click();
    await expect
      .poll(() => note.evaluate((element) => element.clientHeight))
      .toBeGreaterThan(initialHeight);
    await page.getByRole("button", { name: "Show less", exact: true }).click();
    await page.getByRole("button", { name: "Shorten comment" }).click();
    await expect(expand).toHaveCount(0);
  },
);

test(
  "long comments reveal the clipped text and collapse back to two lines",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    await openStory(page, testInfo, "components-data-display-clamped-comment--long");
    const expand = page.getByRole("button", { name: "Show more" });
    const paragraph = await controlledBy(expand);
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
  },
);
