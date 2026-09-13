import { EMPTY_SEARCH, searchHref } from "@/lib/search";
import { appBaseURL } from "@/tests/ui/app-server";

import { test, expect } from "./story";

test(
  "signed-out discovery and member pages show accessible authentication callouts",
  { tag: "@app" },
  async ({ page }, info) => {
    const memberRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/search/climbers")) memberRequests.push(request.url());
    });
    await page.goto(`${appBaseURL}/?mode=climber&name=Test`);
    const callout = page.getByRole("region", { name: "Member content" });
    await expect(callout).toBeVisible();
    await expect(page.getByText("Sign in to view climbers.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Boulder", exact: true })).toHaveCount(0);
    expect(memberRequests).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    // Hiding the caret mutates input styles and can race with React hydration.
    await info.attach("signed-out-search", {
      body: await page.screenshot({ fullPage: true, caret: "initial" }),
      contentType: "image/png",
    });

    await page.goto(`${appBaseURL}/users/unavailable-person/journal?tag=trip`);
    await expect(callout).toBeVisible();
    await expect(page).toHaveTitle("Member content · Betabook");
    const next = "/users/unavailable-person/journal?tag=trip";
    await expect(callout.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/sign-in?next=${encodeURIComponent(next)}`,
    );
    await expect(callout.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      `/sign-up?next=${encodeURIComponent(next)}`,
    );
    await info.attach("locked-profile", {
      body: await page.screenshot({ fullPage: true, caret: "initial" }),
      contentType: "image/png",
    });
    await callout.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${appBaseURL}/sign-in?next=${encodeURIComponent(next)}`);
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Search", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Search Betabook" });
    await dialog.getByRole("combobox", { name: "Search Betabook" }).fill("Ridge");
    await expect(dialog.getByRole("region", { name: "Member content" })).toBeVisible();
    await info.attach("public-quick-search", {
      body: await page.screenshot({ fullPage: true, caret: "initial" }),
      contentType: "image/png",
    });
    await dialog.getByRole("link", { name: "Sign up", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const continuation = searchHref({ ...EMPTY_SEARCH, query: "Ridge" });
    await expect(page).toHaveURL(`${appBaseURL}/sign-up?next=${encodeURIComponent(continuation)}`);
    await expect(page.getByRole("heading", { name: "Sign up", exact: true })).toBeVisible();
  },
);

test(
  "real APIs reject missing and forged sessions while the sitemap stays public",
  { tag: ["@behavior", "@app"] },
  async ({ request }) => {
    const endpoints = [
      "/api/search/areas?limit=5",
      "/api/search/climbs?offset=10001",
      "/api/search/climbers?name=Test",
      "/api/areas/missing/climbs",
      "/api/climbs/missing/sends",
      "/api/users/missing/sends",
      "/api/users/missing/journal",
      "/api/users/missing/sends/export",
      "/api/feed",
      "/api/friends",
      "/api/friends/companions",
    ];
    for (const cookie of ["", "better-auth.session_token=invalid-forged-cookie"]) {
      for (const path of endpoints) {
        const response = await request.get(`${appBaseURL}${path}`, { headers: { Cookie: cookie } });
        expect(response.status(), path).toBe(401);
        expect(await response.json(), path).toEqual({ error: "Not signed in" });
        expect(response.headers()["cache-control"], path).toBe("private, no-store");
      }
    }
    const publicSearch = await request.get(`${appBaseURL}/api/public/search/climbs?name=Test`);
    expect(publicSearch.status()).toBe(200);
    const index = await request.get(`${appBaseURL}/sitemap-index.xml`);
    expect(index.status()).toBe(200);
    expect(await index.text()).toContain("/sitemap/0.xml");
    const sitemap = await request.get(`${appBaseURL}/sitemap/0.xml`);
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).not.toContain("/users/");
  },
);
