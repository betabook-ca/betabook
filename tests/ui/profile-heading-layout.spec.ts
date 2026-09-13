import type { Locator, Page, TestInfo } from "@playwright/test";

import { expect, openStory, test } from "./story";

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error("Expected a visible element");
  return value;
}

const middle = (value: { y: number; height: number }) => value.y + value.height / 2;

async function openAt(page: Page, info: TestInfo, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await openStory(page, info, "components-profile-heading--member-profile");
  const hardest = page.getByRole("region", { name: "Hardest sends" });
  return {
    title: await box(page.getByRole("heading", { level: 1, name: "Alex Morgan" })),
    log: await box(page.getByRole("button", { name: "Log", exact: true })),
    share: await box(page.getByRole("button", { name: "Copy profile link", exact: true })),
    friends: await box(page.getByRole("link", { name: "Friends", exact: true })),
    hardest,
    chipTops: await Promise.all(
      ["Boulder", "Sport", "Trad"].map(
        async (label) => (await box(hardest.getByText(label, { exact: true }))).y,
      ),
    ),
  };
}

test(
  "a phone keeps the profile actions and hardest grades on single rows",
  { tag: "@behavior" },
  async ({ page }, info) => {
    const header = await openAt(page, info, 390);

    expect(Math.abs(middle(header.share) - middle(header.log))).toBeLessThanOrEqual(2);
    expect(Math.abs(middle(header.friends) - middle(header.log))).toBeLessThanOrEqual(2);
    expect(Math.abs(header.share.width - header.share.height)).toBeLessThanOrEqual(1);
    expect(Math.max(...header.chipTops) - Math.min(...header.chipTops)).toBeLessThanOrEqual(2);
    expect((await box(header.hardest.getByText("151 sends"))).width).toBeLessThanOrEqual(1);
  },
);

test(
  "a tablet puts the profile actions beside the name",
  { tag: "@behavior" },
  async ({ page }, info) => {
    const header = await openAt(page, info, 1024);

    expect(header.log.x).toBeGreaterThan(header.title.x + header.title.width);
    expect(header.log.y).toBeLessThan(header.title.y + header.title.height);
    expect(Math.abs(middle(header.friends) - middle(header.log))).toBeLessThanOrEqual(2);
    expect(Math.max(...header.chipTops) - Math.min(...header.chipTops)).toBeLessThanOrEqual(2);
  },
);

test(
  "the desktop side column keeps one action row above stacked hardest sends",
  { tag: "@behavior" },
  async ({ page }, info) => {
    const header = await openAt(page, info, 1440);

    expect(Math.abs(middle(header.share) - middle(header.log))).toBeLessThanOrEqual(2);
    expect(Math.abs(middle(header.friends) - middle(header.log))).toBeLessThanOrEqual(2);
    const [boulder, sport, trad] = header.chipTops;
    expect(sport - boulder).toBeGreaterThanOrEqual(10);
    expect(trad - sport).toBeGreaterThanOrEqual(10);
  },
);
