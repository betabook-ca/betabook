import { expect, test, openStory } from "./story";

test(
  "feed stays centered in one reading column and notes use the width below navigation",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    await openStory(page, testInfo, "components-journal-feed-timeline--activity-feed");
    const cards = page.getByRole("article");
    await expect(cards).toHaveCount(4);
    const first = await cards.first().boundingBox();
    const second = await cards.nth(1).boundingBox();
    if (!first || !second) throw new Error("Missing feed cards");
    expect(first.width).toBeLessThanOrEqual(672);
    expect(first.x).toBeCloseTo(((page.viewportSize()?.width ?? 0) - first.width) / 2, 0);
    expect(second.x).toBe(first.x);
    expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
    const note = page.getByText("Painfully close! Fun session watching Jordan send second go.", {
      exact: true,
    });
    const noteBox = await note.boundingBox();
    if (!noteBox) throw new Error("Missing note");
    expect(noteBox.x + noteBox.width).toBeCloseTo(first.x + first.width - 17, 0);
    expect(await note.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  },
);

test(
  "shared climb separates posted difficulty from each person's grade opinion",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    await openStory(page, testInfo, "components-journal-feed-activity-card--shared-climb");
    const climb = page.getByRole("link", { name: "Cedar Arete", exact: true });
    const posted = page.getByText("V4", { exact: true });
    const suggestion = page.getByText("V5", { exact: true });
    const climbBox = await climb.boundingBox(),
      postedBox = await posted.boundingBox(),
      ownBox = await suggestion.boundingBox();
    if (!climbBox || !postedBox || !ownBox) throw new Error("Missing grade geometry");
    expect(postedBox.x).toBeGreaterThan(climbBox.x + climbBox.width);
    expect(ownBox.y).toBeGreaterThan(climbBox.y + climbBox.height);
    await expect(climb).toHaveCSS("font-size", "16px");
    await expect(page.getByRole("link", { name: "Upper Boulders", exact: true })).toHaveCSS(
      "font-size",
      "12px",
    );
    const author = page.getByRole("link", { name: "Jordan Lee", exact: true });
    const status = page.getByText("Send · Redpoint", { exact: true });
    if ((page.viewportSize()?.width ?? 0) < 640) {
      const authorBox = await author.boundingBox(),
        statusBox = await status.boundingBox();
      if (!authorBox || !statusBox) throw new Error("Missing mobile outcome");
      expect(statusBox.y).toBeGreaterThanOrEqual(authorBox.y + authorBox.height);
    }
  },
);

test(
  "expanded groups keep the collapse control after the final activity",
  { tag: "@layout" },
  async ({ page }, testInfo) => {
    await openStory(page, testInfo, "components-journal-feed-activity-card--large-group");
    await page
      .getByRole("button", { name: "Show more: 2 sends · 2 sessions · 2 repeats", exact: true })
      .click();
    const lastNote = page.getByText("Notes from climber 8.", { exact: true });
    await expect(lastNote).toBeVisible();
    const lastBox = await lastNote.boundingBox();
    const collapseBox = await page
      .getByRole("button", { name: "Show less activity", exact: true })
      .boundingBox();
    if (!lastBox || !collapseBox) throw new Error("Missing expanded layout");
    expect(collapseBox.y).toBeGreaterThanOrEqual(lastBox.y + lastBox.height);
  },
);
