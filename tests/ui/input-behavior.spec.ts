import { expect, test, openStory } from "./story";

test(
  "responsive disclosure preserves typed state and the mobile expansion choice",
  { tag: "@behavior" },
  async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openStory(page, info, "components-layout-collapsible-section--responsive-section");
    const toggle = page.getByRole("button", { name: "Climb filters" });
    const input = page.getByRole("textbox", { name: "Climb name" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(input).toBeHidden();
    await toggle.press("Enter");
    await input.fill("Cedar Arete");
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(toggle).toBeHidden();
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("Cedar Arete");
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(input).toHaveValue("Cedar Arete");
    await toggle.press("Enter");
    await expect(input).toBeHidden();
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("Cedar Arete");
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(input).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  },
);

test(
  "calendar selection respects the latest day, clears, and keeps read-only dates unchanged",
  { tag: "@behavior" },
  async ({ page }, info) => {
    await openStory(page, info, "components-inputs-date-picker-field--dates");
    const trigger = page.getByRole("button", { name: "Calendar Empty date", exact: true });
    await trigger.press("Enter");
    const latest = page.getByRole("button", { name: /Sunday, September 6, 2026/ });
    const future = page.getByRole("button", { name: /Monday, September 7, 2026/ });
    await expect(latest).toBeEnabled();
    await expect(future).toBeDisabled();
    await info.attach("calendar-boundary", {
      body: await page.screenshot({ fullPage: true, animations: "disabled" }),
      contentType: "image/png",
    });
    await latest.press("Enter");
    await expect(trigger).toBeFocused();
    await expect(page.getByRole("spinbutton", { name: "day, Empty date", exact: true })).toHaveText(
      "06",
    );
    await expect(
      page.getByRole("spinbutton", { name: "month, Empty date", exact: true }),
    ).toHaveText("09");
    await expect(
      page.getByRole("spinbutton", { name: "year, Empty date", exact: true }),
    ).toHaveText("2026");
    const unknown = page.getByRole("checkbox", { name: "I don't know", exact: true });
    await unknown.press("Space");
    await expect(unknown).toBeChecked();
    await expect(
      page.getByRole("spinbutton", { name: "day, Forgettable date", exact: true }),
    ).toHaveText("dd");
    await unknown.press("Space");
    await expect(unknown).not.toBeChecked();
    await expect(
      page.getByRole("spinbutton", { name: "day, Forgettable date", exact: true }),
    ).toHaveText("06");
    const readonly = page.getByRole("spinbutton", { name: "day, Read-only date", exact: true });
    await readonly.press("ArrowUp");
    await expect(readonly).toHaveText("01");
    await expect(
      page.getByRole("button", { name: "Calendar Read-only date", exact: true }),
    ).toBeDisabled();
  },
);

for (const side of ["left", "right"]) {
  test(
    `${side} sidebar stacks first on phones and uses its requested desktop side`,
    { tag: "@layout" },
    async ({ page }, info) => {
      await openStory(page, info, `components-layout-sidebar-layout--${side}`);
      const sidebar = await page
        .getByText("Sidebar content comes first on mobile.", { exact: true })
        .boundingBox();
      const content = await page.getByText("Primary content", { exact: true }).boundingBox();
      if (!sidebar || !content) throw new Error("Missing sidebar or primary content");
      if (info.project.name.startsWith("mobile")) {
        expect(sidebar.y + sidebar.height).toBeLessThan(content.y);
        expect(sidebar.width).toBeCloseTo(content.width);
      } else {
        expect(sidebar.y).toBeCloseTo(content.y);
        expect(sidebar.width).toBe(320);
        if (side === "left") expect(sidebar.x + sidebar.width).toBeLessThan(content.x);
        else expect(content.x + content.width).toBeLessThan(sidebar.x);
      }
    },
  );
}

test(
  "progression charts fit the viewport and expose details from the keyboard",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-charts-progression-chart--progression");
    const chart = page.getByRole("region", { name: "boulder grade progression", exact: true });
    await expect(
      page.getByText("Personal best V6, from Sep 2025 (V2) to Sep 2026.", { exact: true }),
    ).toHaveCount(1);
    await chart.focus();
    await expect(chart).toBeFocused();
    await chart.press("ArrowRight");
    await expect(chart.getByRole("button", { name: /Sep 2025/ })).toBeFocused();
    await expect(page.getByRole("tooltip")).toContainText("Sep 2025 · V2");
    await expect(page.getByRole("tooltip").getByText("Cedar Arete", { exact: true })).toBeVisible();
    await expect(page.getByRole("tooltip")).not.toContainText("2025-09-01");
    await page.keyboard.press("ArrowRight");
    await expect(chart.getByRole("button", { name: /Jan 2026/ })).toBeFocused();
    await expect(page.getByRole("tooltip").filter({ hasText: "Sep 2025" })).toHaveCount(0);
    await expect(page.getByRole("tooltip")).toContainText("Jan 2026 · V4 · 5 sends");
    await page.keyboard.press("End");
    await expect(chart.getByRole("button", { name: /Sep 2026/ })).toBeFocused();
    await expect(page.getByRole("tooltip").filter({ hasText: "Jan 2026" })).toHaveCount(0);
    await expect(page.getByRole("tooltip")).toContainText("Sep 2026 · V6");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
    expect(await chart.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
    const single = page.getByRole("region", { name: "sport grade progression", exact: true });
    await expect(single.locator("circle")).toHaveCount(1);
    const coordinates = await single.locator("circle").evaluate((node) => ({
      x: Number(node.getAttribute("cx")),
      y: Number(node.getAttribute("cy")),
    }));
    expect(coordinates.x).toBeGreaterThan(40);
    expect(coordinates.x).toBeLessThan(628);
    expect(coordinates.y).toBeGreaterThan(10);
    expect(coordinates.y).toBeLessThan(176);
  },
);
