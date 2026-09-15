import { expect, test, openStory } from "./story";

test(
  "the session-or-send choice precedes the date and unlocks I don't know for sends",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-journal-entry-fields--outdoor");
    const picker = page.getByRole("radiogroup", { name: "Session or send", exact: true });
    const session = page.getByRole("radio", { name: "Session", exact: true });
    const date = page.getByRole("group", { name: "Date", exact: true });
    const unknown = page.getByRole("checkbox", { name: "I don't know", exact: true });
    const pickerBox = await picker.boundingBox();
    let dateBox = await date.boundingBox();
    if (!pickerBox || !dateBox) throw new Error("Expected visible picker and date controls");
    expect(pickerBox.y + pickerBox.height).toBeLessThan(dateBox.y);
    await expect(session).toHaveAttribute("aria-checked", "true");
    await expect(unknown).toBeHidden();

    await page.getByRole("radio", { name: "Flash", exact: true }).click();
    // I don't know sits beside the field, vertically aligned with it.
    dateBox = await date.boundingBox();
    const unknownLabel = await page.getByText("I don't know", { exact: true }).boundingBox();
    if (!dateBox || !unknownLabel) throw new Error("Expected a visible I don't know control");
    expect(unknownLabel.x).toBeGreaterThan(dateBox.x + dateBox.width);
    expect(
      Math.abs(unknownLabel.y + unknownLabel.height / 2 - (dateBox.y + dateBox.height / 2)),
    ).toBeLessThan(3);

    await unknown.press("Space");
    await expect(unknown).toBeChecked();
    await expect(page.getByRole("button", { name: "Save send" })).toBeVisible();
    await page.getByRole("radio", { name: "Session", exact: true }).click();
    await expect(unknown).toBeHidden();
    await expect(page.getByRole("button", { name: "Save entry" })).toBeVisible();
  },
);
