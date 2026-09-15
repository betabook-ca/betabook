import type { Page } from "@playwright/test";

import { expect, test, openStory } from "./story";

async function submissions(page: Page) {
  return JSON.parse(await page.getByRole("status", { name: "Submitted entries" }).innerText()) as {
    undated: boolean;
    fields: [string, string][];
  }[];
}
async function addFriend(page: Page) {
  const input = page.getByRole("combobox", { name: "Find a friend to tag" });
  await input.fill("Sam");
  await page.getByRole("option", { name: "Sam Rivera", exact: true }).click();
  await input.press("Tab");
}

test("send commentary help opens without submitting the form", async ({ page }, info) => {
  await openStory(page, info, "components-journal-entry-fields--outdoor");
  const help = page.getByRole("button", { name: "About Send commentary", exact: true });
  await expect(help).toHaveCount(0);
  await page.getByRole("radio", { name: "Redpoint", exact: true }).click();
  await expect(help).toHaveAttribute("type", "button");
  await help.scrollIntoViewIfNeeded();
  if (info.project.use.hasTouch) await help.tap();
  else await help.click();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Uses your Send commentary audience wherever this note appears.",
  );
  expect(await submissions(page)).toEqual([]);
  await page.getByRole("textbox", { name: "Notes" }).focus();
  await expect(page.getByRole("tooltip")).toBeHidden();
});

for (const story of ["outdoor", "repeat", "training"]) {
  test(
    `${story} keeps friends and tags below notes and ascent fields`,
    { tag: "@layout" },
    async ({ page }, info) => {
      await openStory(page, info, `components-journal-entry-fields--${story}`);
      const details = page.getByRole("button", { name: "Add details" });
      await expect(details).toHaveAttribute("aria-expanded", "false");
      await details.click();
      await addFriend(page);
      if (story !== "training") {
        const send = story === "repeat" ? "Repeat" : "Redpoint";
        await page.getByRole("radio", { name: send, exact: true }).click();
        await expect(page.getByRole("button", { name: "Remove friend Sam Rivera" })).toBeVisible();
      } else {
        await expect(page.getByRole("radio", { name: "Session", exact: true })).toHaveCount(0);
      }
      const friends = await page.getByRole("group", { name: "Tagged friends" }).boundingBox();
      const notes = await page.getByRole("textbox", { name: "Notes" }).boundingBox();
      if (!friends || !notes) throw new Error("Missing friend picker or note field");
      expect(notes.y + notes.height).toBeLessThan(friends.y);
      if (story === "outdoor") {
        const picker = await page
          .getByRole("radiogroup", { name: "Session or send" })
          .boundingBox();
        if (!picker) throw new Error("Missing session-or-send picker");
        expect(picker.y + picker.height).toBeLessThan(notes.y);
      }
    },
  );
}
