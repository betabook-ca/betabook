import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { trips } from "@/db/schema";
import migration from "@/drizzle/migrations/0051_trip_notes_friends_album.sql?raw";
import { MAX_TRIP_DESCRIPTION } from "@/lib/trips";
import { seedFixtureTrip, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const db = createDb(env.DB);
const BISHOP = { userId: "owner", startDate: "2026-03-10", endDate: "2026-03-20" };
const LONG = `Ten days in the Buttermilks.\n${"Camped at the Pit. ".repeat(10)}`;

/** The last statement in the migration moves long descriptions into notes. */
const statement = migration
  .split("--> statement-breakpoint")
  .at(-1)!
  .split("\n")
  .filter((line) => !line.startsWith("--"))
  .join(" ")
  .trim();

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner" });
});

async function stored(id: number) {
  const [row] = await db
    .select({ description: trips.description, notes: trips.notes })
    .from(trips)
    .where(eq(trips.id, id));
  return row;
}

it("leaves descriptions of 160 characters or fewer in place", async () => {
  const short = await seedFixtureTrip(db, {
    ...BISHOP,
    name: "Bishop",
    description: "Ten days in the Buttermilks.",
  });
  const atTheCap = await seedFixtureTrip(db, {
    ...BISHOP,
    name: "Red Rock",
    description: "x".repeat(MAX_TRIP_DESCRIPTION),
  });
  const bare = await seedFixtureTrip(db, { ...BISHOP, name: "Squamish", description: null });

  await env.DB.prepare(statement).run();

  expect(await stored(short.id)).toEqual({
    description: "Ten days in the Buttermilks.",
    notes: null,
  });
  expect(await stored(atTheCap.id)).toEqual({
    description: "x".repeat(MAX_TRIP_DESCRIPTION),
    notes: null,
  });
  expect(await stored(bare.id)).toEqual({ description: null, notes: null });
});

it("moves longer descriptions into notes unchanged", async () => {
  expect(LONG.length).toBeGreaterThan(MAX_TRIP_DESCRIPTION);
  const trip = await seedFixtureTrip(db, { ...BISHOP, name: "Bishop", description: LONG });

  await env.DB.prepare(statement).run();
  await env.DB.prepare(statement).run();

  expect(await stored(trip.id)).toEqual({ description: null, notes: LONG });
});

it("does not overwrite existing notes", async () => {
  const trip = await seedFixtureTrip(db, {
    ...BISHOP,
    name: "Bishop",
    description: LONG,
    notes: "# Day one",
  });

  await env.DB.prepare(statement).run();

  expect(await stored(trip.id)).toEqual({ description: LONG, notes: "# Day one" });
});

it("uses the same limit as the form", () => {
  expect(statement).toMatch(/^UPDATE trips SET notes = description/);
  expect(statement).toContain(`length(description) > ${MAX_TRIP_DESCRIPTION}`);
});
