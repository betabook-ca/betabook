import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import { sends } from "@/db/schema";
import { seedFixtureTree, seedFixtureUser } from "@/test/fixtures";

/**
 * Boulder sends are redpoint or flash only. The app enforces that in
 * lib/sends.ts; the triggers from 0042_boulder_first_try_is_flash are the
 * backstop for every other write path, so these go straight at `sends`.
 */

let db: Database;

const BOULDER = 1; // Test Highball, from seedFixtureTree
const SPORT = 3; // Test Crimper
const TRAD = 4; // Test Crack
const USER = "style-guard-user";

beforeAll(async () => {
  db = createDb(env.DB);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: USER, name: "Style Guard User" });
});

beforeEach(async () => {
  await db.delete(sends);
});

function insertSend(climbId: number, ascentStyle: "redpoint" | "flash" | "onsight") {
  return db.insert(sends).values({ userId: USER, climbId, ascentStyle, dateSent: null });
}

/** Drizzle's own message is just the failing SQL; the trigger's message and
 * SQLITE_CONSTRAINT_TRIGGER sit further down the `cause` chain. */
async function expectBoulderOnsightRejection(statement: Promise<unknown>) {
  const error = await statement.then(
    () => {
      throw new Error("expected the boulder-onsight guard to reject this statement");
    },
    (err: unknown) => err,
  );
  const chain: string[] = [];
  for (let cur = error; cur instanceof Error; cur = cur.cause) chain.push(cur.message);
  expect(chain.join(" | ")).toMatch(/boulder sends cannot be onsights/);
  expect(chain.join(" | ")).toMatch(/SQLITE_CONSTRAINT_TRIGGER/);
}

async function styleOf(climbId: number) {
  const row = await db
    .select({ ascentStyle: sends.ascentStyle })
    .from(sends)
    .where(and(eq(sends.userId, USER), eq(sends.climbId, climbId)))
    .get();
  return row?.ascentStyle ?? null;
}

describe("boulder onsight guards", () => {
  it("rejects inserting a boulder onsight and leaves no row behind", async () => {
    await expectBoulderOnsightRejection(insertSend(BOULDER, "onsight"));
    expect(await styleOf(BOULDER)).toBeNull();
  });

  it.each(["redpoint", "flash"] as const)("accepts a boulder %s", async (style) => {
    await insertSend(BOULDER, style);
    expect(await styleOf(BOULDER)).toBe(style);
  });

  it.each([SPORT, TRAD])("accepts an onsight on rope climb %i", async (climbId) => {
    await insertSend(climbId, "onsight");
    expect(await styleOf(climbId)).toBe("onsight");
  });

  it("rejects changing a boulder send's style to onsight", async () => {
    await insertSend(BOULDER, "flash");
    await expectBoulderOnsightRejection(
      db
        .update(sends)
        .set({ ascentStyle: "onsight" })
        .where(and(eq(sends.userId, USER), eq(sends.climbId, BOULDER))),
    );
    expect(await styleOf(BOULDER)).toBe("flash");
  });

  it("rejects moving a rope onsight onto a boulder", async () => {
    await insertSend(SPORT, "onsight");
    await expectBoulderOnsightRejection(
      db
        .update(sends)
        .set({ climbId: BOULDER })
        .where(and(eq(sends.userId, USER), eq(sends.climbId, SPORT))),
    );
    expect(await styleOf(SPORT)).toBe("onsight");
    expect(await styleOf(BOULDER)).toBeNull();
  });

  it("still lets a boulder send change between redpoint and flash", async () => {
    await insertSend(BOULDER, "redpoint");
    await db
      .update(sends)
      .set({ ascentStyle: "flash" })
      .where(and(eq(sends.userId, USER), eq(sends.climbId, BOULDER)));
    expect(await styleOf(BOULDER)).toBe("flash");
  });
});
