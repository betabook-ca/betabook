import { expect, openStory, test } from "./story";

for (const [story, label] of [
  ["profile", "Logbook"],
  ["many-notifications", "Community, 120 pending friend requests"],
  ["all-tabs-with-notifications", "Logbook, 2 notifications"],
  ["all-tabs-with-notifications", "Progress, 5 notifications"],
  ["all-tabs-with-notifications", "Community, 12 notifications"],
  ["friend-requests", "Community, 12 pending friend requests"],
]) {
  test(`tab bar highlights ${label} on ${story}`, async ({ page }, info) => {
    await openStory(page, info, `components-navigation-tab-bar--${story}`);
    const nav = page.getByRole("navigation", { name: "Primary" });
    const active = nav.getByRole("link", { name: label, exact: true });
    await active.click();
    await expect(active).toHaveAttribute("aria-current", /page|location/);
    await expect(active).toHaveCSS("text-decoration-line", "none");
    await expect(active).toHaveCSS("font-weight", "600");
    const inactive = nav.locator("a:not([aria-current])").first();
    if (label.startsWith("Progress")) {
      await expect(active.locator("svg")).toHaveAttribute("fill", "none");
      await expect(active.locator("svg")).toHaveAttribute("stroke-width", "2.8");
    } else {
      await expect(active.locator("svg")).toHaveAttribute("fill", "currentColor");
    }
    await expect(inactive.locator("svg")).toHaveAttribute("fill", "none");
    const highlight = await nav.locator("ul").evaluate((element) => {
      const style = getComputedStyle(element, "::before");
      const box = element.getBoundingClientRect();
      return {
        opacity: style.opacity,
        color: style.backgroundColor,
        x: box.x + new DOMMatrixReadOnly(style.transform).m41,
        width: Number.parseFloat(style.width),
        height: Number.parseFloat(style.height),
      };
    });
    const activeBox = await active.boundingBox();
    if (!activeBox) throw new Error("Expected the selected tab");
    expect(highlight.opacity).toBe("1");
    expect(highlight.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(Math.abs(highlight.x - activeBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(highlight.width - activeBox.width)).toBeLessThanOrEqual(1);
    expect(highlight.height).toBe(activeBox.height);
    await expect(active.locator(":scope > span:has(svg)")).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    expect(await active.evaluate((element) => getComputedStyle(element).color)).not.toBe(
      await inactive.evaluate((element) => getComputedStyle(element).color),
    );
  });
}

test(
  "tab bar splits its width into even, touch-sized tabs",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-navigation-tab-bar--friend-requests");
    const nav = page.getByRole("navigation", { name: "Primary" });
    const tabs = await nav.getByRole("link").all();
    expect(tabs).toHaveLength(3);
    const widths: number[] = [];
    for (const tab of tabs) {
      const box = await tab.boundingBox();
      if (!box) throw new Error("Expected visible tabs");
      expect(box.height).toBeGreaterThanOrEqual(44);
      widths.push(box.width);
    }
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    const navBox = await nav.boundingBox();
    const community = await nav.locator("a[href='/feed']").boundingBox();
    const count = await nav.locator("a[href='/feed'] [aria-hidden='true']").last().boundingBox();
    if (!navBox || !community || !count) throw new Error("Expected the Community request count");
    expect(count.y).toBeGreaterThanOrEqual(community.y + 4);
    expect(count.height).toBeLessThanOrEqual(16);
    const icon = await nav.locator("a[href='/feed'] svg").boundingBox();
    if (!icon) throw new Error("Expected the Community icon");
    expect(count.x - icon.x - icon.width).toBeGreaterThanOrEqual(4);
    expect(
      Math.abs(icon.x + icon.width / 2 - community.x - community.width / 2),
    ).toBeLessThanOrEqual(1);
    expect(count.y).toBeLessThan(icon.y);
    expect(count.x + count.width).toBeLessThanOrEqual(community.x + community.width);
  },
);

test("menu selection fills the menu row", async ({ page }, info) => {
  await openStory(page, info, "components-navigation-app-menu--profile");
  const nav = page.getByRole("navigation", { name: "Menu" });
  const active = nav.getByRole("link", { name: "Logbook", exact: true });
  await expect(active).toHaveAttribute("aria-current", "location");
  await expect(active).toHaveCSS("font-weight", "600");
  const activeBox = await active.boundingBox();
  const feedBox = await nav.getByRole("link", { name: "Community", exact: true }).boundingBox();
  if (!activeBox || !feedBox) throw new Error("Expected visible menu rows");
  expect(Math.abs(activeBox.width - feedBox.width)).toBeLessThanOrEqual(1);
  expect(await active.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    await nav
      .getByRole("link", { name: "Community", exact: true })
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  );
});

test(
  "selection glides between tabs and respects reduced motion",
  { tag: "@behavior" },
  async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openStory(page, info, "components-navigation-tab-bar--profile");
    const nav = page.getByRole("navigation", { name: "Primary" });
    const track = nav.locator("ul");
    expect(
      await track.evaluate((el) => getComputedStyle(el, "::before").transitionDuration),
    ).toContain("0.28s");
    await nav.getByRole("link", { name: "Progress", exact: true }).click();
    await expect(nav.getByRole("link", { name: "Progress", exact: true })).toHaveAttribute(
      "aria-current",
      /page|location/,
    );
    await expect
      .poll(() =>
        track.evaluate((el) => {
          const x = new DOMMatrixReadOnly(getComputedStyle(el, "::before").transform).m41;
          return Math.abs(x - el.getBoundingClientRect().width / 3);
        }),
      )
      .toBeLessThan(1);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await track.evaluate((el) => getComputedStyle(el, "::before").transitionDuration)).toBe(
      "0s",
    );
    await nav.getByRole("link", { name: "Community", exact: true }).click();
    await expect
      .poll(() =>
        track.evaluate((el) => {
          const x = new DOMMatrixReadOnly(getComputedStyle(el, "::before").transform).m41;
          return Math.abs(x - (el.getBoundingClientRect().width * 2) / 3);
        }),
      )
      .toBeLessThan(1);
  },
);

test(
  "the fixed phone bar minimizes down and expands up without hiding destinations",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "components-navigation-tab-bar--scroll-behavior");
    const nav = page.getByRole("navigation", { name: "Primary", exact: true });
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("Expected viewport");
    if (viewport.width >= 768) {
      await expect(nav).toBeHidden();
      return;
    }
    const expanded = await nav.boundingBox();
    if (!expanded) throw new Error("Expected phone navigation");
    expect(expanded.width).toBeLessThanOrEqual(viewport.width - 48);
    await page.mouse.wheel(0, 500);
    await expect(nav).toHaveAttribute("data-compact", "true");
    const compact = await nav.boundingBox();
    if (!compact) throw new Error("Expected compact navigation");
    expect(compact.height).toBe(50);
    expect(compact.width).toBeLessThan(expanded.width);
    expect(compact.y + compact.height).toBe(expanded.y + expanded.height);
    for (const link of await nav.getByRole("link").all()) {
      await expect(link).toBeInViewport();
      const box = await link.boundingBox();
      if (!box) throw new Error("Expected tappable destination");
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    await page.mouse.wheel(0, -100);
    await expect(nav).toHaveAttribute("data-compact", "false");
    expect(await nav.boundingBox()).toEqual(expanded);
    await page.mouse.wheel(0, 200);
    await expect(nav).toHaveAttribute("data-compact", "true");
    await nav.getByRole("link", { name: "Progress, 5 notifications", exact: true }).click();
    await expect(nav).toHaveAttribute("data-compact", "false");
    await expect(
      nav.getByRole("link", { name: "Progress, 5 notifications", exact: true }),
    ).toHaveAttribute("aria-current", /page|location/);
  },
);

for (const [story, label] of [
  ["find-climbs", "Find climbs"],
  ["add-area", "Add climb or area"],
  ["tutorials", "Tutorials"],
  ["secondary-tools", "Account settings"],
]) {
  test(`menu uses the selected filled icon for ${label}`, async ({ page }, info) => {
    await openStory(page, info, `components-navigation-app-menu--${story}`);
    const link = page
      .getByRole("navigation", { name: "Menu" })
      .getByRole("link", { name: label, exact: true });
    await expect(link).toHaveAttribute("aria-current", /page|location/);
    await expect(link.locator("svg")).toHaveAttribute("fill", "currentColor");
    await expect(link.locator("svg")).toHaveCSS("width", "20px");
  });
}
