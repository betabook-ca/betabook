import { appBaseURL } from "@/tests/ui/app-server";

import { expect, test } from "./story";

test(
  "the app enables device safe-area insets",
  { tag: ["@app", "@behavior"] },
  async ({ page }) => {
    await page.goto(appBaseURL);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/,
    );
  },
);

test(
  "a search started before JavaScript keeps the same input, caret and text through enhancement",
  { tag: ["@behavior", "@app"] },
  async ({ page }) => {
    let resume!: () => void;
    const held = new Promise<void>((done) => {
      resume = done;
    });
    await page.route("**/assets/*.js", async (route) => {
      await held;
      await route.continue();
    });
    try {
      await page.goto(appBaseURL, { waitUntil: "commit" });
      const frame = page.locator("#public-entry");
      await expect(
        frame.getByRole("heading", { name: "A free climbing logbook and crag database" }),
      ).toBeVisible();
      const field = frame.getByRole("searchbox", { name: "Search Betabook" });
      await field.pressSequentially("granite");
      const native = await field.elementHandle();
      await field.press("Shift+ArrowLeft");
      resume();
      await expect(frame).toHaveCount(0);
      const live = page.getByRole("searchbox", { name: "Search Betabook" });
      await expect(page).toHaveURL(/\/search\?.*name=granite/);
      await expect(live).toBeFocused();
      expect(await live.evaluate((input, previous) => input === previous, native)).toBe(true);
      expect(
        await live.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd]),
      ).toEqual([6, 7]);
      await live.press("x");
      await expect(live).toHaveValue("granitx");
      await expect(page).toHaveURL(/name=granitx/);
      await native?.dispose();
    } finally {
      resume();
    }
  },
);

test(
  "home search and climbing logbook links work with JavaScript disabled",
  { tag: ["@behavior", "@app"] },
  async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(appBaseURL);
      await page.getByRole("searchbox", { name: "Search Betabook" }).fill("granite");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(page).toHaveURL(/\/search\?.*name=granite/);
      await page.goto(appBaseURL + "/climbing-logbook");
      await expect(
        page.getByRole("heading", { name: "A free climbing logbook", exact: true }),
      ).toBeVisible();
      const link = page.getByRole("link", { name: "Create a free account", exact: true });
      await expect(link).toBeVisible();
      await link.click();
      await expect(page).toHaveURL(/\/sign-up/);
    } finally {
      await context.close();
    }
  },
);

test(
  "a native navigation already pressed stays clickable while the application starts",
  { tag: ["@behavior", "@app"] },
  async ({ page }) => {
    let resume!: () => void;
    const held = new Promise<void>((done) => {
      resume = done;
    });
    await page.route("**/assets/*.js", async (route) => {
      await held;
      await route.continue();
    });
    try {
      await page.goto(appBaseURL, { waitUntil: "commit" });
      const frame = page.locator("#public-entry");
      const sidebar = frame.getByRole("complementary", { name: "Sidebar" });
      await expect(sidebar.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
      await expect(sidebar.getByRole("button", { name: /sidebar/ })).toHaveCount(0);
      const link = frame.getByRole("link", { name: "How Betabook works" });
      const bounds = await link.boundingBox();
      if (!bounds) throw new Error("Missing native logbook link");
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      resume();
      await page.waitForFunction(() => Boolean(document.querySelector("#root main h1")));
      await expect(frame).toBeVisible();
      await page.mouse.up();
      await expect(page).toHaveURL(/\/climbing-logbook$/);
      await expect(
        page.getByRole("heading", { name: "A free climbing logbook", exact: true }),
      ).toBeVisible();
    } finally {
      resume();
    }
  },
);
