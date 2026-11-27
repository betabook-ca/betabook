import { expect } from "./story";
import { signInMember, test } from "./worker-app";

test(
  "an expired session offers sign-in back to the unfinished tour",
  { tag: ["@app", "@behavior"] },
  async ({ page, workerApp }) => {
    await signInMember(page.request, workerApp, "tour-member");
    await page.goto(new URL("/tutorial/journal/account", workerApp.url).href);
    const finish = page.getByRole("button", { name: "Finish tour" });
    await expect(finish).toBeVisible();
    await workerApp.db.prepare("DELETE FROM session WHERE user_id = ?").bind("tour-member").run();
    await finish.click();
    await expect(
      page.getByText("Your session has expired — sign in again to continue."),
    ).toBeVisible();
    const link = page.getByRole("link", { name: "Sign in to finish" });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    const target = new URL(href ?? "", workerApp.url);
    expect(target.pathname).toBe("/sign-in");
    expect(new URL(target.searchParams.get("next") ?? "", workerApp.url).pathname).toBe(
      "/tutorial/journal/account",
    );
  },
);
