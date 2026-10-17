import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import { climbs, sends } from "@/db/schema";
import { seedFixtureTree, seedFixtureUser } from "@/test/fixtures";

/**
 * Every climb has a listed grade and every send a suggested grade. The app
 * validates both; the triggers from 0054_require_grades are the backstop for
 * every other write path, so these go straight at the tables.
 */

let db: Database;

const BOULDER = 1; // Test Highball, from seedFixtureTree
const USER = "grade-guard-user";

beforeAll(async () => {
  db = createDb(env.DB);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: USER, name: "Grade Guard User" });
});

beforeEach(async () => {
  await db.delete(sends);
});

/** The trigger's message sits further down Drizzle's `cause` chain. */
async function expectRejection(statement: Promise<unknown>, message: RegExp) {
  const error = await statement.then(
    () => {
      throw new Error("expected the grade guard to reject this statement");
    },
    (err: unknown) => err,
  );
  const chain: string[] = [];
  for (let cur = error; cur instanceof Error; cur = cur.cause) chain.push(cur.message);
  expect(chain.join(" | ")).toMatch(message);
  expect(chain.join(" | ")).toMatch(/SQLITE_CONSTRAINT_TRIGGER/);
}

describe("climb grade guard", () => {
  it("rejects a new climb without a grade", async () => {
    const area = await db
      .select({ areaId: climbs.areaId })
      .from(climbs)
      .where(eq(climbs.id, BOULDER))
      .get();
    await expectRejection(
      db
        .insert(climbs)
        .values({ name: "No Grade", areaId: area!.areaId, type: "boulder", grade: null }),
      /climb grade is required/,
    );
  });

  it("rejects clearing a climb's grade and keeps the old one", async () => {
    await expectRejection(
      db.update(climbs).set({ grade: null }).where(eq(climbs.id, BOULDER)),
      /climb grade is required/,
    );
    const row = await db
      .select({ grade: climbs.grade })
      .from(climbs)
      .where(eq(climbs.id, BOULDER))
      .get();
    expect(row?.grade).not.toBeNull();
  });
});

describe("send suggested grade guard", () => {
  it("rejects a send without a suggested grade", async () => {
    await expectRejection(
      db
        .insert(sends)
        .values({ userId: USER, climbId: BOULDER, ascentStyle: "redpoint", suggestedGrade: null }),
      /suggested grade is required/,
    );
  });

  it("rejects clearing a send's suggested grade and leaves other updates alone", async () => {
    await db
      .insert(sends)
      .values({ userId: USER, climbId: BOULDER, ascentStyle: "redpoint", suggestedGrade: 4 });
    await expectRejection(
      db.update(sends).set({ suggestedGrade: null }).where(eq(sends.userId, USER)),
      /suggested grade is required/,
    );
    await db.update(sends).set({ comment: "Still graded" }).where(eq(sends.userId, USER));
    const row = await db.select().from(sends).where(eq(sends.userId, USER)).get();
    expect(row).toMatchObject({ suggestedGrade: 4, comment: "Still graded" });
  });
});
