import type { Locator } from "@playwright/test";

import { expect, openStory, test } from "./story";

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error("Expected a visible element");
  return value;
}

const middle = (value: { y: number; height: number }) => value.y + value.height / 2;

test(
  "the profile summary shares rows with its actions and grades below the side column",
  { tag: "@behavior" },
  async ({ page }, info) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await openStory(page, info, "components-profile-heading--member-profile");

    const title = await box(page.getByRole("heading", { level: 1, name: "Alex Morgan" }));
    const log = await box(page.getByRole("button", { name: "Log", exact: true }));
    expect(log.x).toBeGreaterThan(title.x + title.width);
    expect(log.y).toBeLessThan(title.y + title.height);

    const friends = await box(page.getByRole("link", { name: "Friends", exact: true }));
    expect(Math.abs(middle(friends) - middle(log))).toBeLessThanOrEqual(2);

    const hardest = page.getByRole("region", { name: "Hardest sends" });
    const chips = await Promise.all(
      ["Boulder", "Sport", "Trad"].map((label) => box(hardest.getByText(label, { exact: true }))),
    );
    const tops = chips.map((chip) => chip.y);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2);
  },
);
