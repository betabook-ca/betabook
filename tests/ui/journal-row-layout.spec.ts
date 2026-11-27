import { expect, openStory, test } from "./story";

test("the journal date anchors the row and the note uses the reading column", async ({
  page,
}, info) => {
  await openStory(page, info, "components-journal-entry-row--sent-long-note");
  const row = page.locator("[data-journal-example]");
  const title = row.getByRole("link", { name: "Cedar Arete", exact: true });
  const grade = row.getByText("V4", { exact: true });
  const status = row.getByText("Sent", { exact: true });
  const date = row.locator("time");
  const menu = row.getByRole("button", { name: "Entry actions" });
  const area = row.getByText("Granite Canyon", { exact: true });
  const tag = row.getByRole("link", { name: "#footwork, filter journal" });
  const note = row.getByText(/^Found a comfortable high foot/);
  const titleBox = await title.boundingBox();
  const gradeBox = await grade.boundingBox();
  const statusBox = await status.boundingBox();
  const dateBox = await date.boundingBox();
  const areaBox = await area.boundingBox();
  const tagBox = await tag.boundingBox();
  const noteBox = await note.boundingBox();
  if (!titleBox || !gradeBox || !statusBox || !dateBox || !areaBox || !tagBox || !noteBox)
    throw new Error("Missing journal row bounds");
  expect(dateBox.x + dateBox.width).toBeLessThan(titleBox.x);
  expect(dateBox.y).toBeCloseTo(titleBox.y, 0);
  const articleBox = await row.locator("article").boundingBox();
  if (!articleBox) throw new Error("Missing journal row bounds");
  const gradeEnd = articleBox.x + articleBox.width - (info.project.use.hasTouch ? 0 : 40);
  expect(Math.abs(gradeBox.x + gradeBox.width - gradeEnd)).toBeLessThanOrEqual(2);
  expect(gradeBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
  expect(statusBox.y).toBeGreaterThan(titleBox.y);
  expect(noteBox.y).toBeGreaterThanOrEqual(areaBox.y + areaBox.height);
  expect(tagBox.y).toBeGreaterThanOrEqual(noteBox.y + noteBox.height);
  expect(noteBox.x).toBe(titleBox.x);
  await expect(note).toHaveCSS("font-size", "14px");
  await expect(note).toHaveCSS("line-height", "21px");
  expect(noteBox.width).toBeGreaterThan(titleBox.width);
  // Touch screens open the menu with a long press (row-long-press.spec.ts),
  // so the button leaves the layout there.
  await expect(menu).toHaveCSS("width", info.project.use.hasTouch ? "1px" : "32px");
  await row.getByRole("button", { name: "Show more" }).click();
  expect((await grade.boundingBox())?.y).toBe(gradeBox.y);
  await expect(row.getByRole("button", { name: "Show less" })).toBeVisible();
});

test("journal icons line up across graded and ungraded entries @layout", async ({ page }, info) => {
  const offset = async (story: string, title: string, icon: string, label: string) => {
    await openStory(page, info, story);
    const titleBox = await page.getByText(title, { exact: true }).first().boundingBox();
    const iconBox = await page.locator(`svg.lucide-${icon}`).first().boundingBox();
    const labelBox = await page.getByText(label, { exact: true }).last().boundingBox();
    if (!titleBox || !iconBox || !labelBox)
      throw new Error("Missing journal title, icon, or status bounds");
    expect(
      Math.abs(iconBox.y + iconBox.height / 2 - labelBox.y - labelBox.height / 2),
    ).toBeLessThanOrEqual(1);
    return iconBox.y - titleBox.y;
  };

  const sent = await offset(
    "components-journal-entry-row--sent",
    "Cedar Arete",
    "circle-check-big",
    "Sent",
  );
  const session = await offset(
    "components-journal-entry-row--session",
    "Cedar Arete",
    "circle-dashed",
    "Session",
  );
  const training = await offset(
    "components-journal-entry-row--training",
    "Training",
    "dumbbell",
    "Training",
  );
  expect(Math.abs(session - sent)).toBeLessThanOrEqual(2);
  expect(Math.abs(training - sent)).toBeLessThanOrEqual(2);
});

test("a send's grade and stars end the climb name's line, beside its date column @layout", async ({
  page,
}, info) => {
  await openStory(page, info, "components-journal-climb-log-row--sent");
  const row = page.locator("[data-climb-log-example]");
  const title = row.getByRole("link", { name: "Cedar Arete", exact: true });
  const grade = row.getByText("V4", { exact: true });
  const stars = row.getByText("3", { exact: true });
  const status = row.getByText("Flash", { exact: true });
  const date = row.locator('time[datetime="2026-09-04"]');
  const area = row.getByRole("link", { name: "Granite Canyon" });
  const comment = row.getByText("A calm finish after a few good attempts.");
  const [titleBox, gradeBox, starsBox, statusBox, dateBox, areaBox, commentBox] = await Promise.all(
    [
      title.boundingBox(),
      grade.boundingBox(),
      stars.boundingBox(),
      status.boundingBox(),
      date.boundingBox(),
      area.boundingBox(),
      comment.boundingBox(),
    ],
  );
  if (!titleBox || !gradeBox || !starsBox || !statusBox || !dateBox || !areaBox || !commentBox)
    throw new Error("Missing send row bounds");

  expect(Math.abs(gradeBox.y - titleBox.y)).toBeLessThanOrEqual(4);
  expect(Math.abs(starsBox.y - gradeBox.y)).toBeLessThanOrEqual(4);
  const rowBox = await row.locator("article").boundingBox();
  if (!rowBox) throw new Error("Missing send row bounds");
  expect(Math.abs(starsBox.x + starsBox.width - rowBox.x - rowBox.width)).toBeLessThanOrEqual(24);
  expect(statusBox.y).toBeGreaterThan(gradeBox.y);
  expect(dateBox.x + dateBox.width).toBeLessThan(titleBox.x);
  expect(commentBox.y - areaBox.y - areaBox.height).toBeGreaterThanOrEqual(6);
  expect(commentBox.y - areaBox.y - areaBox.height).toBeLessThanOrEqual(16);
});
