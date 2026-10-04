import type { Locator } from "@playwright/test";

import { expect, openStory, test } from "./story";

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error("Expected a visible element");
  return value;
}

const middle = (value: { y: number; height: number }) => value.y + value.height / 2;

for (const width of [390, 1024]) {
  test(
    `the sign-up invite sits under the name and badges, not beside the avatar, at ${width}px`,
    { tag: "@layout" },
    async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await openStory(page, info, "components-auth-shared-profile--preview");

      const summary = page.getByRole("complementary", { name: "Climber summary" });
      const avatar = await box(summary.locator("span", { hasText: /^AR$/ }).first());
      const title = await box(page.getByRole("heading", { level: 1 }));
      const chips = await box(page.getByRole("region", { name: "Hardest sends" }));
      const invite = await box(page.getByText(/^Sign up to send/));
      const signUp = await box(page.getByRole("link", { name: "Sign up" }));

      // The avatar is centred on the name and badges only.
      expect(middle(avatar)).toBeGreaterThanOrEqual(title.y);
      expect(middle(avatar)).toBeLessThanOrEqual(chips.y + chips.height);
      // The invite and its buttons come after the badges.
      expect(invite.y).toBeGreaterThanOrEqual(chips.y + chips.height);
      expect(signUp.y).toBeGreaterThanOrEqual(invite.y + invite.height - 1);
      if (width < 640) {
        // On a phone the invite uses the full width, in line with the avatar.
        expect(invite.x).toBeLessThanOrEqual(avatar.x + 1);
        expect(signUp.x).toBeLessThanOrEqual(avatar.x + 1);
      } else {
        // On a wider screen it stays in the name column.
        expect(invite.x).toBeGreaterThanOrEqual(title.x - 1);
      }
    },
  );
}
