import { appBaseURL } from "./app-server";
import { expect, openStory, test } from "./story";

test(
  "sidebar icons stay fixed throughout animated previews",
  { tag: "@layout" },
  async ({ page }, info) => {
    test.skip(
      info.project.name.startsWith("mobile"),
      "Animation applies only to the desktop sidebar",
    );
    await openStory(page, info, "components-navigation-sidebar--moderator");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const sidebar = page.getByRole("complementary", { name: "Sidebar" });
    const heading = page.locator("[data-sidebar-content]");
    await heading.hover();
    const [samples] = await Promise.all([
      page.evaluate(async () => {
        const panel = document.querySelector('aside[aria-label="Sidebar"]');
        const feed = panel?.querySelector('a[href="/feed"] svg');
        const content = document.querySelector("[data-sidebar-content]");
        if (!panel || !feed || !content) throw new Error("Missing sidebar geometry");
        const frames: { iconX: number; iconY: number; contentX: number; width: number }[] = [];
        const started = performance.now();
        await new Promise<void>((resolve) => {
          const sample = () => {
            const icon = feed.getBoundingClientRect();
            frames.push({
              iconX: icon.x,
              iconY: icon.y,
              contentX: content.getBoundingClientRect().x,
              width: panel.getBoundingClientRect().width,
            });
            if (performance.now() - started < 1200) requestAnimationFrame(sample);
            else resolve();
          };
          requestAnimationFrame(sample);
        });
        return frames;
      }),
      (async () => {
        for (let pass = 0; pass < 2; pass += 1) {
          await sidebar.hover();
          await expect(sidebar).toHaveCSS("width", "224px");
          await heading.hover();
          await expect(sidebar).toHaveCSS("width", "64px");
        }
      })(),
    ]);
    expect(samples.length).toBeGreaterThan(10);
    expect(samples.some(({ width }) => width > 64 && width < 224)).toBe(true);
    const first = samples[0];
    for (const sample of samples) {
      expect(sample.iconX).toBe(first.iconX);
      expect(sample.iconY).toBe(first.iconY);
      expect(sample.contentX).toBe(first.contentX);
    }
  },
);

test("sidebar preview overlays content and pinning reserves space", async ({ page }, info) => {
  await openStory(page, info, "components-navigation-sidebar--moderator");
  const sidebar = page.getByRole("complementary", { name: "Sidebar" });
  if (info.project.name.startsWith("mobile")) {
    await expect(sidebar).toBeHidden();
    return;
  }
  const content = page.locator("[data-sidebar-content]");
  const before = await content.boundingBox();
  if (!before) throw new Error("Missing page content");
  await expect(sidebar).toHaveCSS("width", "64px");
  const toggle = sidebar.getByRole("button", { name: /sidebar/ });
  const feedIcon = sidebar.getByRole("link", { name: /^Community/ }).locator("svg");
  const iconBefore = await feedIcon.boundingBox();
  if (!iconBefore) throw new Error("Missing navigation icon");
  await expect(toggle).toHaveCSS("width", "40px");
  await expect(toggle).toHaveCSS("height", "40px");
  const feed = sidebar.getByRole("link", { name: /^Community/ });
  await expect(feed).toHaveCSS("width", "40px");
  await expect(feed).toHaveCSS("height", "40px");
  expect(iconBefore.width).toBe(20);
  expect(iconBefore.height).toBe(20);
  expect(iconBefore.x + iconBefore.width / 2).toBe(32);
  // Storybook nests the example header inside its main, so it is not a banner landmark.
  const header = page.locator("header");
  for (const control of [
    header.getByRole("link", { name: "Betabook home" }),
    header.getByRole("link", { name: "Search", exact: true }),
    header.getByRole("button", { name: "Log", exact: true }),
  ]) {
    const box = await control.boundingBox();
    if (!box) throw new Error("Missing header control");
    expect(box.height).toBe(40);
    expect(box.y).toBe(8);
  }
  const firstRow = await sidebar.getByRole("link", { name: "Logbook", exact: true }).boundingBox();
  const workspaceTabs = await page
    .getByRole("navigation", { name: "Community sections" })
    .boundingBox();
  if (!firstRow || !workspaceTabs) throw new Error("Missing navigation rows");
  expect(firstRow.y).toBe(64);
  expect(workspaceTabs.y).toBe(firstRow.y);
  const utilities = [
    sidebar.getByRole("link", { name: "Tutorials" }),
    sidebar.getByRole("link", { name: "Moderation" }),
    sidebar.getByRole("link", { name: "Account settings", exact: true }),
    sidebar.getByRole("button", { name: "Sign out" }),
  ];
  let previousY: number | undefined;
  for (const item of utilities) {
    const box = await item.boundingBox();
    if (!box) throw new Error("Missing utility row");
    expect(box.height).toBe(40);
    if (previousY !== undefined) expect(box.y - previousY).toBe(44);
    previousY = box.y;
  }
  const signOutBounds = await utilities[3].boundingBox();
  const sidebarBounds = await sidebar.boundingBox();
  if (!signOutBounds || !sidebarBounds) throw new Error("Missing sidebar utility bounds");
  expect(sidebarBounds.y + sidebarBounds.height - signOutBounds.y - signOutBounds.height).toBe(12);
  await toggle.hover();
  await expect(sidebar).toHaveCSS("width", "224px");
  expect(await feedIcon.boundingBox()).toEqual(iconBefore);
  await page.locator("[data-sidebar-content]").hover();
  await info.attach("sidebar-collapsed", {
    body: await page.screenshot({ path: info.outputPath("sidebar-collapsed.png") }),
    contentType: "image/png",
  });
  await sidebar.hover();
  await expect(sidebar).toHaveCSS("width", "224px");
  expect((await content.boundingBox())?.x).toBe(before.x);
  const destination = sidebar.getByRole("link", { name: "Add climb or area" });
  const text = destination.getByText("Add climb or area", { exact: true });
  expect((await text.boundingBox())?.width).toBeGreaterThan(70);
  await info.attach("sidebar-hover", { body: await page.screenshot(), contentType: "image/png" });
  await page.locator("[data-sidebar-content]").hover();
  await expect(sidebar).toHaveCSS("width", "64px");
  await page.getByRole("button", { name: "Expand sidebar" }).focus();
  await expect(sidebar).toHaveCSS("width", "224px");
  await page.getByRole("button", { name: "Keep sidebar expanded" }).click();
  await page.locator("[data-sidebar-content]").click();
  expect((await content.boundingBox())?.x).toBe(before.x + 160);
  await expect(sidebar).toHaveCSS("width", "224px");
  await info.attach("sidebar-pinned", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "64px");
  await page.setViewportSize({ width: 1024, height: 400 });
  await sidebar.hover();
  const signOut = sidebar.getByRole("button", { name: "Sign out" });
  await signOut.scrollIntoViewIfNeeded();
  await expect(signOut).toBeInViewport();
});

test(
  "app uses the sidebar on desktop and the menu popover on mobile",
  { tag: "@app" },
  async ({ page }, info) => {
    await page.goto(appBaseURL);
    const sidebar = page.getByRole("complementary", { name: "Sidebar" });
    const menu = page.getByRole("button", { name: "Open menu", exact: true });
    if (info.project.name.startsWith("desktop")) {
      await expect(menu).toBeHidden();
      await expect(sidebar.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
      // Pin through the control without depending on its transient hover label.
      // Preview behavior is covered by the gallery tests above.
      await sidebar.getByRole("button", { name: /sidebar/ }).click();
      await expect(sidebar.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
      await sidebar.getByRole("link", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
    } else {
      await expect(sidebar).toBeHidden();
      await expect(page.locator('header a[aria-label="Search"] [data-brand="icon"]')).toBeVisible();
      await menu.click();
      const popover = page.getByRole("dialog");
      await expect(popover).toBeVisible();
      await expect(popover.locator("[data-brand]")).toHaveCount(0);
      await expect(menu).toBeVisible();
      const headerBrand = page.locator('header a[aria-label="Search"]');
      await expect(headerBrand).toBeVisible();
      await info.attach("mobile-menu", { body: await page.screenshot(), contentType: "image/png" });
      await popover.getByRole("link", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(popover).toBeHidden();
      await expect(headerBrand).toBeVisible();
      await menu.click();
      await expect(popover).toBeVisible();
      await page.setViewportSize({ width: 1024, height: 900 });
      await expect(popover).toBeHidden();
      await expect(sidebar).toBeVisible();
    }
    await info.attach("responsive-navigation", {
      body: await page.screenshot({ path: info.outputPath("responsive-navigation.png") }),
      contentType: "image/png",
    });
  },
);
