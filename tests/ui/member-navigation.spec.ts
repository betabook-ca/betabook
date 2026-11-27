import { expect } from "./story";
import { signInMember, test } from "./worker-app";

test(
  "an unavailable session check on tab return preserves the unsaved account draft",
  { tag: ["@app", "@behavior"] },
  async ({ page, workerApp }) => {
    await signInMember(page.request, workerApp, "member");
    await page.goto(new URL("/account", workerApp.url).href);
    const field = page.getByRole("textbox", { name: "Display name" });
    await field.fill("Pending edit");
    const original = await field.elementHandle();
    await page.route("**/api/auth/get-session", (route) => route.fulfill({ status: 503 }), {
      times: 1,
    });
    for (const status of [503, 200]) {
      const checked = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/auth/get-session" &&
          response.status() === status,
      );
      // Headless tabs do not reliably emit OS-level focus events.
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await (await checked).finished();
      await expect(field).toHaveValue("Pending edit");
      expect(await field.evaluate((node, previous) => node === previous, original)).toBe(true);
    }
    await original?.dispose();
  },
);

test(
  "an expired member session can open the sign-in form and navigate Back",
  { tag: ["@app", "@behavior"] },
  async ({ page, context, workerApp }) => {
    await signInMember(page.request, workerApp, "member");
    await page.goto(new URL("/users/member/lists", workerApp.url).href);
    const settings = page.locator('main a[href="/account#privacy"]');
    await expect(settings).toBeVisible();
    await context.clearCookies();
    const expired = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/pages/account" && r.status() === 401,
    );
    await settings.click();
    await expired;
    const signIn = page.getByRole("main").getByRole("link", { name: "Sign in", exact: true });
    await signIn.click();
    await expect(page.getByRole("main").locator("input[type=password]")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new URL("/account#privacy", workerApp.url).href);
    await expect(signIn).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Display name" })).toHaveCount(0);
  },
);

test(
  "a settings fragment scrolls when the account loader supplies its target",
  { tag: ["@app", "@layout"] },
  async ({ page, workerApp }) => {
    await signInMember(page.request, workerApp, "member");
    await page.goto(new URL("/users/member/lists", workerApp.url).href);
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/pages/account", async (route) => {
      await ready;
      await route.continue();
    });
    try {
      const request = page.waitForRequest(
        (r) => new URL(r.url()).pathname === "/api/pages/account",
      );
      await page.locator('main a[href="/account#privacy"]').click();
      await request;
      await expect(page.locator("#privacy")).toHaveCount(0);
      release();
      const target = page.locator("#privacy");
      await expect(target).toBeVisible();
      await expect
        .poll(() => target.evaluate((e) => Math.round(e.getBoundingClientRect().top)))
        .toBeLessThan(50);
    } finally {
      release();
    }
  },
);

test(
  "a native public area page continues after its starting window in the SPA",
  { tag: ["@app", "@behavior"] },
  async ({ page, workerApp: { url, db } }) => {
    await db.prepare("INSERT INTO areas(id,name) VALUES(1,'Test area')").run();
    await db.batch(
      ["A", "B", "C", "D"].map((name) =>
        db
          .prepare("INSERT INTO climbs(area_id,name,type,grade) VALUES(1,?,'boulder',5)")
          .bind(name),
      ),
    );
    for (const window of ["offset=1", "page=2"]) {
      const href = new URL("/areas/1/test-area?sort=name_asc&limit=1&" + window, url).href;
      await page.goto(href);
      await expect(page.locator("#public-entry")).toHaveCount(0);
      const rows = page.locator('main a[href^="/climbs/"]');
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toHaveAttribute("href", "/climbs/2/b");
      await page.getByRole("button", { name: "Load more" }).click();
      await expect(rows).toHaveCount(2);
      await expect(rows.last()).toHaveAttribute("href", "/climbs/3/c");
    }
  },
);
