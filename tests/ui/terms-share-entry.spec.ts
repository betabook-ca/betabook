import { expect } from "./story";
import { signInMember, test } from "./worker-app";

test(
  "a pending-terms member can read a live public profile invitation and still sees the agreement on member pages",
  { tag: ["@app", "@behavior"] },
  async ({ page, workerApp }) => {
    const { url, db } = workerApp;
    await signInMember(page.request, workerApp, "pending-reader");
    await db.batch([
      db.prepare(
        "UPDATE user SET terms_version=NULL, terms_accepted_at=NULL WHERE id='pending-reader'",
      ),
      db.prepare(
        "INSERT INTO user(id,name,email,email_verified,is_private) VALUES ('inviter','Invitation Owner','inviter@example.test',1,0)",
      ),
    ]);
    const token = await db
      .prepare("SELECT token FROM profile_share_links WHERE user_id='inviter'")
      .first<string>("token");
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    const profile = new URL("/users/inviter?share=" + token, url).href;
    await page.goto(profile);
    await expect(
      page.getByRole("heading", { name: "Invitation Owner", exact: true }),
    ).toBeVisible();
    const terms = page.getByRole("dialog", { name: "Terms of Service" });
    await expect(terms).toHaveCount(0);
    await page.goto(new URL("/users/pending-reader/journal", url).href);
    await expect(terms).toBeVisible();
    const home = new URL("/", url).href;
    await page.goto(home);
    await expect(terms).toBeVisible();
    await expect(page).toHaveURL(home);
  },
);
