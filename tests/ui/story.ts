import {
  expect,
  test as base,
  type ConsoleMessage,
  type Page,
  type TestInfo,
} from "@playwright/test";

// A visible story heading must not hide an unhandled error elsewhere in the tree.
export const test = base.extend<{ runtimeErrors: undefined }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      const capture = (error: Error) => errors.push(error.message);
      const captureConsole = (message: ConsoleMessage) => {
        // The controlled clock reports timer exceptions through console.error.
        // Browser resource diagnostics have no JS arguments (e.g. an image
        // deliberately blocked by the email test); asset checks own those.
        if (message.type() === "error" && message.args().length > 0) errors.push(message.text());
      };
      page.on("pageerror", capture);
      page.on("console", captureConsole);
      await page.route("**/api/**", async (route) => {
        if (new URL(page.url()).pathname === "/iframe.html") {
          errors.push(`Story called a live API: ${route.request().url()}`);
          await route.abort();
        } else await route.continue();
      });
      await use(undefined);
      page.off("pageerror", capture);
      page.off("console", captureConsole);
      expect(errors, "Browser errors and unexpected story API calls").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function openStory(page: Page, info: TestInfo, id: string) {
  const theme = info.project.use.colorScheme === "dark" ? "dark" : "light";
  await page.clock.setFixedTime(new Date("2026-09-06T12:00:00-07:00"));
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  // Storybook waits up to five seconds for animations before running afterEach.
  // Allow that lifecycle to finish, including animations inside closed details.
  await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true", {
    timeout: 10_000,
  });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .filter((animation) => {
          const effect = animation.effect;
          return (
            !(effect instanceof KeyframeEffect && effect.target instanceof Element) ||
            effect.target.checkVisibility()
          );
        })
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
}
