import { expect, test, openStory } from "./story";

type GoalFormCase = {
  name: string;
  story: string;
  goalChoice?: string;
  recurrence?: string;
  custom?: boolean;
  width?: number;
};
const cases: GoalFormCase[] = [
  { name: "climbing volume", story: "climbing" },
  { name: "minimum grade", story: "minimum-grade" },
  { name: "grade milestone", story: "new-grade" },
  { name: "training", story: "training" },
  { name: "climbing days", story: "explore" },
  { name: "new areas", story: "explore", goalChoice: "Visit new areas" },
  { name: "weekly training", story: "recurring", recurrence: "every week" },
  { name: "monthly training", story: "recurring", recurrence: "every month" },
  { name: "seasonal climbing", story: "seasonal-goal", custom: true },
  { name: "seasonal training", story: "training", custom: true },
  { name: "narrow training", story: "training", width: 320 },
];

for (const scenario of cases) {
  test(
    `${scenario.name} fields use the shared height and aligned rows`,
    { tag: "@layout" },
    async ({ page }, info) => {
      if (scenario.width) await page.setViewportSize({ width: scenario.width, height: 812 });
      await openStory(page, info, `components-goals-goal-form--${scenario.story}`);
      if (scenario.goalChoice)
        await page.getByRole("button", { name: scenario.goalChoice }).click();
      if (scenario.recurrence) {
        await page.getByRole("button", { name: "Timeframe" }).click();
        await page.getByRole("option", { name: scenario.recurrence, exact: true }).click();
      }
      const timeframe = page.getByRole("button", { name: "Timeframe" });
      if (scenario.custom && scenario.story !== "seasonal-goal") {
        await timeframe.click();
        await page.getByRole("option", { name: "Custom date range", exact: true }).click();
      }
      const count =
        scenario.story === "new-grade"
          ? page.getByRole("button", { name: /Grade$/ })
          : page.locator('input[type="number"]');
      const countBox = await count.boundingBox();
      if (!countBox) throw new Error("Expected a count field");
      const expectedHeight = await count.evaluate((element) => {
        const style = getComputedStyle(element);
        const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
        const border = Number.parseFloat(style.getPropertyValue("--border-width-field"));
        return (matchMedia("(min-width: 640px)").matches ? 2.25 : 2.5) * rem + 2 * border;
      });
      expect(countBox.height).toBe(expectedHeight);
      const timeframeBox = await timeframe.boundingBox();
      if (!timeframeBox) throw new Error("Expected a timeframe field");
      expect(timeframeBox.height).toBe(countBox.height);
      expect(timeframeBox.y).toBeGreaterThanOrEqual(countBox.y);
      const dates = page.locator(".date-input-group");
      await expect(dates).toHaveCount(scenario.custom ? 2 : 0);
      for (const field of await dates.all()) {
        const box = await field.boundingBox();
        expect(box?.height).toBe(countBox.height);
      }
      await info.attach("field-measurements", {
        body: JSON.stringify({
          scenario: scenario.name,
          count: countBox,
          timeframe: timeframeBox,
          expectedHeight,
        }),
        contentType: "application/json",
      });
    },
  );
}
