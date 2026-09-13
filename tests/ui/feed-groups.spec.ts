import { expect, test, openStory } from "./story";

test(
  "connected climb card deduplicates the climb while retaining separate author notes",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    await openStory(page, testInfo, `components-journal-feed-group-card--shared-climb`);
    await expect(page.getByRole("link", { name: "Cedar Arete", exact: true })).toHaveCount(1);
    const authors = page.getByRole("heading", { name: "Alex Rivera and Jordan Lee", exact: true });
    await expect(authors).toBeVisible();
    const authorBox = await authors.boundingBox();
    const climbBox = await page
      .getByRole("link", { name: "Cedar Arete", exact: true })
      .boundingBox();
    if (!authorBox || !climbBox) throw new Error("Missing author or climb layout bounds");
    expect(authorBox.y).toBeLessThan(climbBox.y);
    await expect(
      page.getByText("Worked the opening moves with Jordan.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Found a comfortable high foot.", { exact: true })).toBeVisible();
    await expect(page.getByText(/^With /)).toHaveCount(0);
    await expect(authors.getByRole("link", { name: "Alex Rivera", exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View activity for Jordan Lee on Sep 2, 2026", exact: true }),
    ).toHaveAttribute("href", "/users/jordan/journal?date=2026-09-02");
    await page.screenshot({
      path: testInfo.outputPath("connected-climb.png"),
      fullPage: true,
      animations: "disabled",
    });
  },
);
test(
  "each climber on a shared climb keeps their own grade and feel",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    await openStory(page, testInfo, `components-journal-feed-group-card--disagreeing-grades`);
    const card = page.getByRole("article");
    await expect(card.getByText("V5", { exact: true })).toBeVisible();
    await expect(card.getByText("V4", { exact: true })).toHaveCount(1);
    await expect(card.getByLabel("Felt hard for the grade")).toBeVisible();
    await card.getByText("See all activity (1 more)", { exact: true }).click();
    await expect(card.getByText("V3", { exact: true })).toBeVisible();
    await expect(card.getByLabel("Felt soft for the grade")).toBeVisible();
    const climbBox = await card.getByRole("link", { name: "Cedar Arete" }).boundingBox();
    const ownBox = await card.getByText("V5", { exact: true }).boundingBox();
    if (!climbBox || !ownBox) throw new Error("Missing climb or reported-grade bounds");
    expect(ownBox.y).toBeGreaterThan(climbBox.y);
    await page.screenshot({
      path: testInfo.outputPath("disagreeing-grades.png"),
      fullPage: true,
      animations: "disabled",
    });
  },
);

test(
  "large connected group expands locally without additional requests",
  { tag: "@behavior" },
  async ({ page }, testInfo) => {
    await openStory(page, testInfo, `components-journal-feed-group-card--large-group`);
    await expect(page.getByText("Notes from climber 2.", { exact: true })).toBeVisible();
    await expect(page.getByText("Notes from climber 3.", { exact: true })).toBeHidden();
    await expect(
      page.getByRole("heading", {
        name: "Climbing friend 1 with a long name and 7 others",
        exact: true,
      }),
    ).toBeVisible();
    const requests: string[] = [];
    page.on("request", (request) => {
      if (["fetch", "xhr"].includes(request.resourceType())) requests.push(request.url());
    });
    await page.getByText("See all activity (6 more)", { exact: true }).click();
    await expect(page.getByText("Notes from climber 7.", { exact: true })).toBeVisible();
    await expect(page.getByText("Notes from climber 8.", { exact: true })).toBeVisible();
    expect(requests).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("expanded-group.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByText("Show less", { exact: true }).click();
    await expect(page.getByText("Notes from climber 3.", { exact: true })).toBeHidden();
    await expect(page.getByText("See all activity (6 more)", { exact: true })).toBeVisible();
  },
);

test("the other authors are named in a tooltip on hover and keyboard focus", async ({
  page,
}, testInfo) => {
  await openStory(page, testInfo, `components-journal-feed-group-card--large-group`);
  const trigger = page.getByText("7 others", { exact: true });
  await expect(trigger).toBeVisible();
  // Establish pointer modality before entering the trigger from the fresh page.
  await page.mouse.move(1, 1);
  await trigger.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.getByRole("listitem")).toHaveText(
    Array.from({ length: 7 }, (_, index) => `Climbing friend ${index + 2} with a long name`),
  );
  await page.screenshot({
    path: testInfo.outputPath("other-authors-tooltip.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.mouse.move(0, 0);
  await expect(tooltip).toBeHidden();
  const heading = page.getByRole("heading", {
    name: "Climbing friend 1 with a long name and 7 others",
    exact: true,
  });
  await heading.getByRole("link").focus();
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
});
