import type { Locator } from "@playwright/test";

import { expect, openStory, test } from "./story";

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error("Expected a visible element");
  return value;
}

for (const width of [375, 1024]) {
  test(
    `the share and menu buttons share a row with the trip name only at ${width}px`,
    { tag: "@layout" },
    async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await openStory(page, info, "components-trips-trip-header--with-friends");

      const name = await box(page.getByRole("heading", { level: 2 }).first());
      const share = await box(page.getByRole("button", { name: "Share", exact: true }));
      const menu = await box(page.getByRole("button", { name: /^Actions for/ }));
      const dates = await box(page.getByText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}/).first());
      const counts = await box(page.locator("p", { hasText: "days logged" }));

      // Buttons are to the right of the name, on the same row.
      expect(share.x).toBeGreaterThanOrEqual(name.x + name.width - 1);
      expect(menu.x).toBeGreaterThanOrEqual(share.x + share.width - 1);
      expect(share.y).toBeLessThan(name.y + name.height);
      // Lines below the name use the full width, so the counts fit on one line.
      expect(dates.y).toBeGreaterThanOrEqual(share.y + share.height - 8);
      expect(counts.width).toBeGreaterThanOrEqual(menu.x + menu.width - name.x - 2);
      expect(counts.height).toBeLessThanOrEqual(26);
      // Icon only on phones, icon and label on wider screens.
      if (width < 640) expect(share.width).toBeLessThanOrEqual(44);
      else expect(share.width).toBeGreaterThan(60);
    },
  );
}
