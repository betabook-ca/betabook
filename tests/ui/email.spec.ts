import { expect, test, openStory } from "./story";

test(
  "email documents load the full logo PNG, fit the viewport, and keep literal visitor content",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    for (const variant of [
      "verification",
      "password-reset",
      "welcome",
      "friend-request",
      "contact",
      "moderation-decision",
    ]) {
      await openStory(page, testInfo, `patterns-email--${variant}`);
      const email = page.frameLocator('iframe[title="Email preview"]');
      const logo = email.getByRole("img", {
        name: "Betabook — Climb · Log · Progress",
        exact: true,
      });
      await expect(logo).toBeVisible();
      await expect(logo).toHaveAttribute(
        "src",
        new URL("/branding/betabook-lockup-email.png", page.url()).href,
      );
      await expect
        .poll(() =>
          logo.evaluate(
            (node: HTMLImageElement) =>
              node.complete && node.naturalWidth === 1000 && node.naturalHeight === 640,
          ),
        )
        .toBe(true);
      const logoSize = await logo.boundingBox();
      expect(logoSize).not.toBeNull();
      expect(logoSize?.width).toBeLessThanOrEqual(350);
      expect((logoSize?.width ?? 0) / (logoSize?.height ?? 1)).toBeCloseTo(1000 / 640, 2);
      const dimensions = await email.locator("html").evaluate((node) => ({
        content: node.scrollWidth,
        viewport: node.clientWidth,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
      await expect(email.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(email.locator("img")).toHaveCount(1);
      await expect(email.locator("script")).toHaveCount(0);
      if (variant === "contact") {
        await expect(email.locator("body")).toContainText(
          '<img src=x onerror="alert(1)"> & <script>alert(1)</script>',
        );
        await expect(email.locator("body")).toContainText("The new trail starts near the bridge.");
      }
      if (variant === "welcome") {
        await expect(email.locator("body")).not.toContainText("https://");
        await expect(
          email.getByRole("link", { name: "Import your logbook", exact: true }),
        ).toHaveAttribute("href", "https://example.test/account/import");
        await expect(
          email.getByRole("link", { name: "Log your first send", exact: true }),
        ).toHaveAttribute("href", "https://example.test");
        await expect(
          email.getByRole("link", { name: "Get in touch", exact: true }),
        ).toHaveAttribute("href", "https://example.test/contact");
      }
      if (variant === "verification") {
        const action = email.getByRole("link", { name: "Verify email", exact: true });
        await expect(action).toHaveAttribute(
          "href",
          `https://example.test/api/auth/verify-email?token=${"sample-token-".repeat(20)}&callbackURL=%2Fsign-in`,
        );
        await action.focus();
        await expect(action).toBeFocused();
        await action.press("Enter");
        await expect(action).toBeVisible();
      }
      await testInfo.attach(`email-${variant}`, {
        body: await page.screenshot({ fullPage: true, animations: "disabled" }),
        contentType: "image/png",
      });
    }
  },
);

test(
  "email actions and copy remain available when images are blocked",
  { tag: "@behavior" },
  async ({ page }, testInfo) => {
    await page.route("**/branding/betabook-lockup-email.png", (route) => route.abort());
    await openStory(page, testInfo, "patterns-email--friend-request");
    const email = page.frameLocator('iframe[title="Email preview"]');
    await expect(email.getByRole("heading", { name: "New friend request" })).toBeVisible();
    await expect(email.locator("body")).toContainText(
      "Casey & Morgan sent you a friend request on Betabook.",
    );
    await expect(
      email.getByRole("link", { name: "View friend requests", exact: true }),
    ).toHaveAttribute("href", "https://example.test/friends?view=requests");
  },
);
