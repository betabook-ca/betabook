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
    title: await box(page.getByRole("heading", { level: 1 })),
    chipTops: await Promise.all(
      ["Boulder", "Sport", "Trad"].map(
        async (label) => (await box(hardest.getByText(label, { exact: true }))).y,
      ),
    ),
  };
}

test(
  "a phone keeps the share link beside the name above one row of badges",
  { tag: "@behavior" },
  async ({ page }, info) => {
    const header = await openAt(page, info, 390);
    const share = await box(page.getByRole("button", { name: "Copy profile link", exact: true }));

    expect(share.x).toBeGreaterThanOrEqual(header.title.x + header.title.width - 1);
    expect(Math.abs(middle(share) - middle(header.title))).toBeLessThanOrEqual(4);
    expect(Math.max(...header.chipTops) - Math.min(...header.chipTops)).toBeLessThanOrEqual(2);
    expect(Math.min(...header.chipTops)).toBeGreaterThanOrEqual(
      Math.max(header.title.y + header.title.height, share.y + share.height) - 1,
    );
  },
);

for (const [story, control] of [
  ["another-climber", "Friendship options for Riley Chen"],
  ["stranger", "Add friend: Jordan Lee"],
]) {
  for (const width of [390, 1024]) {
    test(
      `the ${story} friendship control stays beside the name at ${width}px`,
      { tag: "@behavior" },
      async ({ page }, info) => {
        const header = await openAt(page, info, width, story);
        const button = await box(page.getByRole("button", { name: control, exact: true }));

        expect(button.x).toBeGreaterThanOrEqual(header.title.x + header.title.width - 1);
        expect(Math.abs(middle(button) - middle(header.title))).toBeLessThanOrEqual(4);
        expect(Math.max(...header.chipTops) - Math.min(...header.chipTops)).toBeLessThanOrEqual(2);
      },
    );
  }
}

for (const story of ["member-profile", "longest-grades"]) {
  test(
    `the desktop side column keeps the name, share link and badges on their rows for ${story}`,
    { tag: "@behavior" },
    async ({ page }, info) => {
      const header = await openAt(page, info, 1440, story);
      const share = await box(page.getByRole("button", { name: "Copy profile link", exact: true }));
      const column = await box(page.locator(".xl\\:w-68"));

      expect(Math.abs(middle(share) - middle(header.title))).toBeLessThanOrEqual(4);
      expect(share.x + share.width).toBeLessThanOrEqual(column.x + column.width + 1);
      expect(Math.max(...header.chipTops) - Math.min(...header.chipTops)).toBeLessThanOrEqual(2);
    },
  );
}
