import type { APIRequestContext } from "@playwright/test";

import { expect } from "./story";
import { signInMember, test, type WorkerApp } from "./worker-app";

const sessionNote = "Repeated the slab mantle";
const trainingNote = "Completed four hangboard sets";

async function signInWithJournal(request: APIRequestContext, { url, db }: WorkerApp) {
  await signInMember(request, { url, db }, "journal-owner");
  await db.batch([
    db.prepare("INSERT INTO areas(id,name) VALUES (1,'Journal crag')"),
    db.prepare(
      "INSERT INTO climbs(id,area_id,name,type,grade) VALUES (1,1,'Slab mantle','boulder',5)",
    ),
    db
      .prepare(
        "INSERT INTO journal_entries(user_id,climb_id,kind,entry_date,body) VALUES ('journal-owner',1,'session','2026-01-01',?),('journal-owner',NULL,'training','2026-01-02',?)",
      )
      .bind(sessionNote, trainingNote),
  ]);
}

test(
  "signed-in journal keeps its filters mounted and restores Training on Back",
  { tag: ["@app", "@behavior"] },
  async ({ page, workerApp }) => {
    await signInWithJournal(page.request, workerApp);
    const journal = new URL("/users/journal-owner/journal", workerApp.url).href;
    await page.goto(journal);
    const sessionEntry = page.getByText(sessionNote, { exact: true });
    const trainingEntry = page.getByText(trainingNote, { exact: true });
    await expect(sessionEntry).toBeVisible();
    await expect(trainingEntry).toBeVisible();

    const documents: string[] = [];
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        documents.push(request.url());
      }
    });
    const training = page.getByRole("link", { name: "Training", exact: true });
    const sessions = page.getByRole("link", { name: "Sessions", exact: true });
    const initialTrainingLink = await training.elementHandle();
    await training.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(journal + "?view=training");
    await expect(sessionEntry).toHaveCount(0);
    await expect(trainingEntry).toBeVisible();
    await expect(training).toBeFocused();

    await sessions.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(journal + "?view=sessions");
    await expect(trainingEntry).toHaveCount(0);
    await expect(sessionEntry).toBeVisible();
    await expect(sessions).toBeFocused();

    await page.goBack();
    await expect(page).toHaveURL(journal + "?view=training");
    await expect(training).toHaveAttribute("aria-current", "page");
    await expect(sessionEntry).toHaveCount(0);
    await expect(trainingEntry).toBeVisible();
    expect(
      await training.evaluate((link, original) => link === original, initialTrainingLink),
    ).toBe(true);
    expect(documents).toEqual([]);
    await initialTrainingLink?.dispose();
  },
);
