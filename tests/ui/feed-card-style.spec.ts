import { expect, test, openStory } from "./story";

for (const { story, gradeSharesClimbRow } of [
  { story: "feed-day-card--activity-feed", gradeSharesClimbRow: true },
  { story: "feed-group-card--shared-climb", gradeSharesClimbRow: false },
]) {
  test(
    `${story} uses the app's climb, area, and grade layout`,
    { tag: "@layout" },
    async ({ page }, testInfo) => {
      await openStory(page, testInfo, `components-journal-${story}`);
      const climb = page.getByRole("link", { name: "Cedar Arete", exact: true });
      const area = page.getByRole("link", { name: "Upper Boulders", exact: true });
      const root = page
        .getByRole("link", { name: "Cascadia", exact: true, includeHidden: true })
        .first();
      const parent = page
        .getByRole("link", { name: "North Woods", exact: true, includeHidden: true })
        .first();
      const grade = page.getByText("V5", { exact: true }).first();
      await expect(climb).toHaveCSS("font-size", "16px");
      await expect(area).toHaveCSS("font-size", "12px");
      await expect(climb).toHaveAttribute("href", "/climbs/1/cedar-arete");
      await expect(area).toHaveAttribute("href", "/areas/30/upper-boulders");
      await expect(root).toHaveAttribute("href", "/areas/10/cascadia");
      await expect(parent).toHaveAttribute("href", "/areas/20/north-woods");
      if ((page.viewportSize()?.width ?? 0) >= 768) {
        await expect(root).toBeVisible();
        await expect(parent).toBeVisible();
      } else {
        await expect(root).toBeHidden();
        await expect(parent).toBeHidden();
      }
      const climbBox = await climb.boundingBox();
      const areaBox = await area.boundingBox();
      const gradeBox = await grade.boundingBox();
      if (!climbBox || !areaBox || !gradeBox) throw new Error("Missing climb metadata");
      expect(areaBox.y).toBeGreaterThanOrEqual(climbBox.y + climbBox.height - 1);
      if (gradeSharesClimbRow) expect(gradeBox.x).toBeGreaterThan(climbBox.x + climbBox.width);
      else expect(gradeBox.y).toBeGreaterThan(climbBox.y + climbBox.height);
      await expect(page.getByText("Sent", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Repeated", { exact: true })).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath("feed-card.png"),
        fullPage: true,
        animations: "disabled",
      });
    },
  );
}
