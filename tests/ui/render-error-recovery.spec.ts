import { expect, test } from "@playwright/test";

import { appBaseURL } from "@/tests/ui/app-server";

// The failed asset intentionally emits a browser console error. Observe its
// user-visible recovery and the real diagnostic transport.
test(
  "a missing route chunk reveals recovery and retries the same public URL",
  { tag: ["@behavior", "@app"] },
  async ({ page }) => {
    const notices: unknown[] = [];
    // WebKit does not expose a Blob beacon body through request.postDataJSON().
    // Observe the payload at the sender, and let the real Worker validate it.
    await page.exposeFunction("recordRecoveryReport", (body: string) => {
      notices.push(JSON.parse(body));
    });
    await page.addInitScript(() => {
      const send = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url, body) => {
        if (new URL(url, location.href).pathname === "/api/client-errors" && body instanceof Blob) {
          const observer: Window & {
            recordRecoveryReport?: (payload: string) => Promise<void>;
          } = window;
          void body.text().then((payload) => observer.recordRecoveryReport?.(payload));
        }
        return send(url, body);
      };
    });
    const accepted = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/client-errors",
    );
    await page.route("**/assets/search-route-*.js", (route) => route.abort("failed"));
    await page.goto(appBaseURL, { waitUntil: "commit" });
    await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
    await expect(page.locator("#public-entry")).toHaveCount(0);
    await expect(page.getByRole("banner")).toBeVisible();
    await expect
      .poll(() => notices)
      .toEqual([expect.objectContaining({ boundary: "page", path: "/" })]);
    expect((await accepted).status()).toBe(204);
    await page.unroute("**/assets/search-route-*.js");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(
      page.locator("#root").getByRole("searchbox", { name: "Search Betabook" }),
    ).toBeVisible();
    await expect(page).toHaveURL(appBaseURL + "/");
    expect(notices).toHaveLength(1);
  },
);
