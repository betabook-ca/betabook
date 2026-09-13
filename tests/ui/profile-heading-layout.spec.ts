import type { Locator, Page, TestInfo } from "@playwright/test";

import { expect, openStory, test } from "./story";

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error("Expected a visible element");
  return value;
}

const middle = (value: { y: number; height: number }) => value.y + value.height / 2;

async function openAt(page: Page, info: TestInfo, width: number, story = "member-profile") {
  await page.setViewportSize({ width, height: 900 });
  await openStory(page, info, `components-profile-heading--${story}`);
  const hardest = page.getByRole("region", { name: "Hardest sends" });
  return {
    title: await box(page.getByRole("heading", { level: 1, name: "Alex Morgan" })),
    log: await box(page.getByRole("button", { name: "Log", exact: true })),
    share: await box(page.getByRole("button", { name: "Copy profile link", exact: true })),
    friends: await box(page.getByRole("link", { name: "Friends", exact: true })),
    chipTops: await Promise.all(
      ["Boulder", "Sport", "Trad"].map(
        async (label) => (await box(hardest.getByText(label, { exact: true }))).y,
      ),
    ),
  };
}

test(
  "a phone badges grades under the name above one row of actions",
  { tag: "@behavior" },
  async ({ page }, info) => {
    const header = await openAt(page, info, 390);

    expect(Math.abs(middle(header.share) - middle(header.log))).toBeLessThanOrEqual(2);
    expect(Math.abs(middle(header.friends) - middle(header.log))).toBeLessThanOrEqual(2);
    expect(Math.abs(header.share.width - header.share.height)).toBeLessThanOrEqual(1);
    expect(Math.max(...header.chipTops) - Math.min(...header.chipTops)).toBeLessThanOrEqual(2);
    expect(Math.min(...header.chipTops)).toBeGreaterThanOrEqual(
      header.title.y + header.title.height - 1,
    );
    expect(Math.max(...header.chipTops)).toBeLessThan(header.log.y);
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

for (const story of ["member-profile", "longest-grades"]) {
  test(
    `the desktop side column keeps badges and actions on single rows for ${story}`,
    { tag: "@behavior" },
    async ({ page }, info) => {
      const header = await openAt(page, info, 1440, story);

      expect(Math.abs(middle(header.share) - middle(header.log))).toBeLessThanOrEqual(2);
      expect(Math.abs(middle(header.friends) - middle(header.log))).toBeLessThanOrEqual(2);
      expect(Math.max(...header.chipTops) - Math.min(...header.chipTops)).toBeLessThanOrEqual(2);
    },
  );
}
