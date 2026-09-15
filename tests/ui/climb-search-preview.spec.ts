import { expect, test, openStory } from "./story";

test("typing in the mobile log picker reveals the start of climb results", async ({
  page,
}, info) => {
  test.skip((page.viewportSize()?.width ?? 1024) >= 640, "Mobile keyboard behavior");
  await page.route("**/api/search/climbs?**", (route) =>
    route.fulfill({
      json: {
        climbs: Array.from({ length: 5 }, (_, index) => ({
          id: index + 1,
          name: `Cedar ${index + 1}`,
          type: "boulder",
          grade: 5,
          areaId: 1,
          areaName: "Grove",
        })),
        areaBreadcrumbs: {},
        sendStats: {},
        hasNextPage: false,
      },
    }),
  );
  await openStory(page, info, "components-journal-log-popup--choose-entry");
  await page.getByRole("button", { name: /^Outdoor session/ }).click();
  const input = page.getByRole("searchbox", { name: "Choose a climb" });
  await page.setViewportSize({ width: 375, height: 380 });
  await input.fill("cedar");
  const firstResult = page.getByRole("button", { name: /^Choose Cedar 1,/ });
  await expect(firstResult).toBeVisible();
  await expect(input).toBeFocused();
  await expect
    .poll(async () =>
      firstResult.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const body = element.closest(".modal__body")?.getBoundingClientRect();
        return Boolean(
          body &&
          bounds.top >= body.top &&
          bounds.top + 24 <= Math.min(body.bottom, window.innerHeight),
        );
      }),
    )
    .toBe(true);
  await expect(input).toBeInViewport();
  await info.attach("mobile-climb-result-preview", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});
