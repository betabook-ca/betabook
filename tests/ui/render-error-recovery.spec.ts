import { expect, test } from "@playwright/test";

import { appBaseURL } from "@/tests/ui/app-server";

// The failed asset intentionally emits a browser console error. Observe its
// user-visible recovery and the real diagnostic transport.
test(
  "a missing route chunk reveals recovery and retries the same public URL",
  { tag: ["@behavior", "@app"] },
  async ({ page }) => {
    const notices: unknown[] = [];
    await page.route("**/api/client-errors", async (route) => {
      notices.push(route.request().postDataJSON());
      await route.fulfill({ status: 204 });
    });
    await page.route("**/assets/search-route-*.js", (route) => route.abort("failed"));
    await page.goto(appBaseURL, { waitUntil: "commit" });
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
    await expect(page.locator("#public-entry")).toHaveCount(0);
    await expect(page.getByRole("banner")).toBeVisible();
    await expect
      .poll(() => notices)
      .toEqual([expect.objectContaining({ boundary: "page", path: "/" })]);
    await page.unroute("**/assets/search-route-*.js");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(
      page.locator("#root").getByRole("searchbox", { name: "Search Betabook" }),
    ).toBeVisible();
    await expect(page).toHaveURL(appBaseURL + "/");
    expect(notices).toHaveLength(1);
  },
);
