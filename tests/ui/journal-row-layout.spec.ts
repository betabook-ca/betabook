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
  expect(Math.abs(gradeBox.x + gradeBox.width - dateBox.x - dateBox.width)).toBeLessThanOrEqual(2);
  expect(tagBox.y - (areaBox.y + areaBox.height)).toBeLessThanOrEqual(8);
  expect(noteBox.y - (tagBox.y + tagBox.height)).toBeLessThanOrEqual(12);
  expect(noteBox.x).toBe(titleBox.x);
  await expect(menu).toHaveCSS("width", "44px");
  await expect(menu).toHaveCSS("height", "44px");
  await row.getByRole("button", { name: "Show more" }).click();
  expect((await grade.boundingBox())?.y).toBe(gradeBox.y);
  await expect(row.getByRole("button", { name: "Show less" })).toBeVisible();
});
