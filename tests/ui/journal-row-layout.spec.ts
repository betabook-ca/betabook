import { expect, openStory, test } from "./story";

test("journal details stay together beside the right-aligned grade, status, and date", async ({
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
  const tag = row.getByRole("link", { name: "Filter journal by footwork" });
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
  expect(gradeBox.x).toBeGreaterThan(titleBox.x + titleBox.width);
  expect(statusBox.y).toBeGreaterThan(gradeBox.y);
  expect(dateBox.y).toBeGreaterThan(statusBox.y);
  const centreY = (box: { y: number; height: number }) => box.y + box.height / 2;
  expect(
    Math.abs(centreY(statusBox) - centreY(gradeBox) - (centreY(dateBox) - centreY(statusBox))),
  ).toBeLessThanOrEqual(2);
  expect(centreY(dateBox) - centreY(gradeBox)).toBeLessThanOrEqual(53);
  expect(Math.abs(gradeBox.x + gradeBox.width - dateBox.x - dateBox.width)).toBeLessThanOrEqual(2);
  expect(tagBox.y - (areaBox.y + areaBox.height)).toBeLessThanOrEqual(11);
  expect(areaBox.y - (titleBox.y + titleBox.height)).toBeLessThanOrEqual(3);
  expect(tagBox.y - (areaBox.y + areaBox.height)).toBeGreaterThanOrEqual(6);
  expect(noteBox.y - (tagBox.y + tagBox.height)).toBeLessThanOrEqual(6);
  expect(noteBox.x).toBe(titleBox.x);
  await expect(menu).toHaveCSS("width", "44px");
  await expect(menu).toHaveCSS("height", "44px");
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

test("a send's grade and stars start beside the climb name, with status and date below @layout", async ({
  page,
}, info) => {
  await openStory(page, info, "components-journal-climb-log-row--sent");
  const row = page.locator("[data-climb-log-example]");
  const title = row.getByRole("link", { name: "Cedar Arete", exact: true });
  const grade = row.getByText("V4", { exact: true });
  const stars = row.getByText("3", { exact: true });
  const status = row.getByText("Flash", { exact: true });
  const date = row.getByText("Sep 4, 2026", { exact: true });
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
  expect(statusBox.y).toBeGreaterThan(gradeBox.y);
  expect(dateBox.y).toBeGreaterThan(statusBox.y);
  expect(commentBox.y - areaBox.y - areaBox.height).toBeGreaterThanOrEqual(10);
  expect(commentBox.y - areaBox.y - areaBox.height).toBeLessThanOrEqual(16);
});
