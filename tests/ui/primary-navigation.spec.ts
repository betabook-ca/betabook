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
    await expect(active).toHaveCSS("font-weight", "400");
    const inactive = nav.locator("a:not([aria-current])").first();
    await expect(inactive).toHaveCSS("font-weight", "400");
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
      await track.evaluate(
        (el) => getComputedStyle(el, "::before").transitionDuration.split(",")[0],
      ),
    ).toBe("0.15s");
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
    expect(compact.height).toBeCloseTo(50, 1);
    expect(compact.width).toBeCloseTo(Math.min(288, viewport.width - 64), 1);
    expect(compact.y + compact.height).toBeCloseTo(expanded.y + expanded.height, 1);
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

test(
  "the compact phone bar expands and moves the selection together on a tab change",
  { tag: "@layout" },
  async ({ page }, info) => {
    if ((page.viewportSize()?.width ?? 0) >= 768) test.skip();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openStory(page, info, "components-navigation-tab-bar--scroll-behavior");
    const nav = page.getByRole("navigation", { name: "Primary", exact: true });
    await expect(nav).toHaveCSS("backdrop-filter", "none");
    await expect(nav).toHaveCSS("transition-duration", "0.15s");
    await expect(nav).toHaveCSS("transition-timing-function", "linear");
    await expect(nav).toHaveCSS("transition-property", "transform");
    const icon = nav.getByRole("link").first().locator("svg");
    await expect(icon).toHaveCSS("transition-duration", "0s");

    const expandedWidth = await nav.evaluate((bar) => bar.getBoundingClientRect().width);
    await page.mouse.wheel(0, 500);
    await expect(nav).toHaveAttribute("data-compact", "true");
    await nav.evaluate((bar) =>
      Promise.all(bar.getAnimations({ subtree: true }).map((animation) => animation.finished)),
    );

    const progress = nav.getByRole("link", { name: "Progress, 5 notifications", exact: true });
    // Keep the destination in its initial loading state while the router changes tabs.
    await page
      .locator("main")
      .first()
      .evaluate((main) => {
        const placeholder = document.createElement("div");
        placeholder.dataset.loadingRows = "";
        main.appendChild(placeholder);
      });
    const originalBar = await nav.elementHandle();
    await progress.tap();
    await expect(progress).toHaveAttribute("aria-current", /page|location/);
    await expect
      .poll(() => nav.evaluate((bar) => bar.getBoundingClientRect().width))
      .toBeCloseTo(expandedWidth, 1);
    await expect(nav).toHaveAttribute("data-compact", "false");
    await expect(nav).toHaveCSS("height", "62px");
    await page.locator("[data-loading-rows]").evaluate((placeholder) => placeholder.remove());
    expect(await nav.evaluate((bar, original) => bar === original, originalBar)).toBe(true);
  },
);

for (const [story, label] of [
  ["find-climbs", "Find climbs"],
  ["add-area", "Add climb or area"],
  ["tutorials", "Tutorials"],
  ["secondary-tools", "Account settings"],
]) {
  test(`menu uses the selected icon treatment for ${label}`, async ({ page }, info) => {
    await openStory(page, info, `components-navigation-app-menu--${story}`);
    const link = page
      .getByRole("navigation", { name: "Menu" })
      .getByRole("link", { name: label, exact: true });
    await expect(link).toHaveAttribute("aria-current", /page|location/);
    await expect(link.locator("svg")).toHaveAttribute(
      "fill",
      label === "Find climbs" ? "none" : "currentColor",
    );
    if (label === "Find climbs")
      await expect(link.locator("svg")).toHaveAttribute("stroke-width", "2.8");
    await expect(link.locator("svg")).toHaveCSS("width", "20px");
  });
}

test(
  "filled icons preserve the painted outer size of their outlines",
  { tag: "@layout" },
  async ({ page }, info) => {
    await openStory(page, info, "patterns-navigation-icon-options--comparison");
    const pairs = page.locator('[data-theme="light"] [data-navigation-icon-pair]');
    for (const pair of await pairs.all()) {
      const area = await pair.getAttribute("data-navigation-icon-pair");
      if (area === "progress" || area === "search") continue; // These approved exceptions intentionally increase stroke weight.
      const bounds = await pair.locator("svg").evaluateAll(async (icons) =>
        Promise.all(
          icons.map(async (icon) => {
            const copy = icon.cloneNode(true) as SVGSVGElement;
            const originalNodes = [icon, ...icon.querySelectorAll("*")];
            const copyNodes = [copy, ...copy.querySelectorAll("*")];
            for (let i = 0; i < originalNodes.length; i += 1) {
              const style = getComputedStyle(originalNodes[i]);
              for (const property of [
                "fill",
                "stroke",
                "stroke-width",
                "stroke-linecap",
                "stroke-linejoin",
                "fill-rule",
              ]) {
                copyNodes[i].setAttribute(property, style.getPropertyValue(property));
              }
            }
            copy.setAttribute("width", "192");
            copy.setAttribute("height", "192");
            const image = new Image();
            image.src =
              "data:image/svg+xml;charset=utf-8," +
              encodeURIComponent(new XMLSerializer().serializeToString(copy));
            await image.decode();
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 192;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Expected canvas context");
            context.drawImage(image, 0, 0);
            const pixels = context.getImageData(0, 0, 192, 192).data;
            let left = 192,
              top = 192,
              right = -1,
              bottom = -1;
            for (let y = 0; y < 192; y += 1)
              for (let x = 0; x < 192; x += 1) {
                if (pixels[(y * 192 + x) * 4 + 3] < 128) continue;
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x);
                bottom = Math.max(bottom, y);
              }
            return { left, top, right, bottom };
          }),
        ),
      );
      expect(bounds).toHaveLength(2);
      for (const edge of ["left", "top", "right", "bottom"] as const) {
        expect
          .soft(Math.abs(bounds[0][edge] - bounds[1][edge]), `${area} ${edge} painted edge`)
          .toBeLessThanOrEqual(1);
      }
    }
  },
);

test(
  "Search navigation, header, query fields and lookups share one outline",
  { tag: "@layout" },
  async ({ page }, info) => {
    let reference: unknown;
    for (const story of [
      "components-navigation-primary-icon--find-climbs",
      "components-navigation-search-trigger--default",
      "components-inputs-query-field--character-limit",
    ]) {
      await openStory(page, info, story);
      const icon = page.locator("svg[data-search-icon]");
      await expect(icon).toHaveCount(1);
      await expect(icon.locator("circle")).toHaveCount(1);
      const shape = await icon.evaluate((el) => ({
        viewBox: el.getAttribute("viewBox"),
        fill: el.getAttribute("fill"),
        strokeWidth: getComputedStyle(el).strokeWidth,
        circle: ["cx", "cy", "r"].map((key) => el.querySelector("circle")?.getAttribute(key)),
        handle: ["x1", "y1", "x2", "y2"].map((key) => el.querySelector("line")?.getAttribute(key)),
      }));
      expect(shape.strokeWidth).toBe("1.7px");
      if (reference === undefined) reference = shape;
      else expect(shape).toEqual(reference);
    }
    await openStory(page, info, "components-search-selection-field--area");
    const lookup = page.locator(".search-combo-input");
    const backgroundShape = await lookup.evaluate((el) => {
      const image = getComputedStyle(el).backgroundImage;
      const url = image.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
      if (!url) throw new Error("Expected the lookup magnifier");
      const document = new DOMParser().parseFromString(
        decodeURIComponent(url.slice(url.indexOf(",") + 1)),
        "image/svg+xml",
      );
      const svg = document.documentElement;
      return {
        viewBox: svg.getAttribute("viewBox"),
        fill: svg.getAttribute("fill"),
        strokeWidth: `${svg.getAttribute("stroke-width")}px`,
        circle: ["cx", "cy", "r"].map((key) => svg.querySelector("circle")?.getAttribute(key)),
        handle: ["x1", "y1", "x2", "y2"].map((key) => svg.querySelector("line")?.getAttribute(key)),
      };
    });
    expect(backgroundShape).toEqual(reference);
  },
);
