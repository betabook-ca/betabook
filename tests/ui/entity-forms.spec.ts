import { test, expect, openStory } from "./story";

for (const form of ["area", "climb"]) {
  test(
    `add ${form} uses one area label and shared field widths`,
    { tag: "@layout" },
    async ({ page }, info) => {
      await openStory(page, info, `components-forms-${form}-form--new-${form}`);
      const area = page.getByRole("combobox", {
        name: form === "area" ? /^Parent area/ : /^Area/,
      });
      const name = page.getByRole("textbox", { name: /^Name/ });
      await expect(area).toBeVisible();
      await expect(
        page.locator("label").filter({ hasText: /^(Parent area|Area)\*?$/ }),
      ).toHaveCount(1);
      const areaBox = await area.boundingBox();
      const nameBox = await name.boundingBox();
      if (!areaBox || !nameBox) throw new Error("Expected visible area and name fields");
      expect(Math.abs(nameBox.width - areaBox.width)).toBeLessThanOrEqual(4);
      expect(nameBox.width).toBeLessThanOrEqual(384);
      const description = await page
        .getByRole("textbox", { name: "Description", exact: true })
        .boundingBox();
      if (!description) throw new Error("Expected visible description field");
      expect(description.height).toBeGreaterThanOrEqual(120);
      expect(description.width).toBeGreaterThanOrEqual(nameBox.width);
      const requiredLabels =
        form === "area" ? ["Parent area", "Name"] : ["Area", "Name", "Discipline", "Grade"];
      for (const label of requiredLabels) {
        const fieldLabel = page.locator("label").filter({ hasText: new RegExp(`^${label}$`) });
        await expect(fieldLabel).toHaveCount(1);
        expect(
          await fieldLabel.evaluate((element) => getComputedStyle(element, "::after").content),
        ).toContain("*");
      }
      if (form === "climb") {
        const grade = await page.getByRole("button", { name: /Grade$/ }).boundingBox();
        if (!grade) throw new Error("Expected visible grade field");
        expect(grade.width).toBeLessThan(nameBox.width);
      }
    },
  );
}
