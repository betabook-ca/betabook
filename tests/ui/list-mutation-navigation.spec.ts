import { expect } from "./story";
import { signInMember, test } from "./worker-app";

test(
  "a completed list write keeps the restored list index after Back and Forward",
  { tag: ["@app", "@behavior"] },
  async ({ page, workerApp }) => {
    await signInMember(page.request, workerApp, "member");
    await page.goto(new URL("/users/member/projects", workerApp.url).href);
    const path = "/users/member/lists";
    await page.locator(`main a[href="${path}"]`).click();
    await page.getByRole("button", { name: "New list" }).click();
    const dialog = page.getByRole("dialog", { name: "New list" });
    await dialog.getByRole("textbox", { name: /Name/ }).fill("Winter circuit");

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let confirm!: () => void;
    const committed = new Promise<void>((resolve) => {
      confirm = resolve;
    });
    await page.route("**/api/actions/createClimbList", async (route) => {
      const response = await route.fetch();
      try {
        expect((await response.json()).ok).toBe(true);
        confirm();
        await held;
        await route.fulfill({ response });
      } finally {
        await response.dispose();
      }
    });

    try {
      await dialog.getByRole("button", { name: "Create list" }).click();
      await committed;
      await page.goBack();
      await expect(page).toHaveURL(new URL("/users/member/projects", workerApp.url).href);
      await page.goForward();
      await expect(page).toHaveURL(new URL(path, workerApp.url).href);
      const refreshed = page.waitForResponse((response) =>
        /^\/api\/pages\/users\/member\/lists(?:\/\d+)?$/.test(new URL(response.url()).pathname),
      );
      release();
      await refreshed;
      await expect(page).toHaveURL(new URL(path, workerApp.url).href);
      await expect(
        page.locator("main").getByRole("link", { name: "Winter circuit" }),
      ).toBeVisible();
    } finally {
      release();
    }
  },
);
