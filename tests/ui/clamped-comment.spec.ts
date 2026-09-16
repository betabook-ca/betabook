import { expect, openStory, test } from "./story";

test("comment updates recheck truncation even when the clamped height stays unchanged", async ({
  page,
}, info) => {
  await openStory(page, info, "components-data-display-clamped-comment--updated-comment");
  const expand = page.getByRole("button", { name: "Show more", exact: true });
  await expect(expand).toHaveCount(0);
  const paragraph = page.getByText(
    "Found a new sequence at the crux and linked all of the moves.",
    {
      exact: true,
    },
  );
  const initialHeight = await paragraph.evaluate((element) => element.clientHeight);
  await page.getByRole("button", { name: "Lengthen comment" }).click();
  const note = page.locator("p[id]");
  expect(await note.evaluate((element) => element.clientHeight)).toBe(initialHeight);
  expect(await note.evaluate((element) => element.scrollHeight)).toBeGreaterThan(initialHeight);
  await expect(expand).toBeVisible();
  await expand.click();
  expect(await note.evaluate((element) => element.clientHeight)).toBeGreaterThan(initialHeight);
  await page.getByRole("button", { name: "Show less", exact: true }).click();
  await page.getByRole("button", { name: "Shorten comment" }).click();
  await expect(expand).toHaveCount(0);
});
