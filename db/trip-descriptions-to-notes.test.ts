import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { trips } from "@/db/schema";
import migration from "@/drizzle/migrations/0053_trip_descriptions_to_notes.sql?raw";
import { MAX_TRIP_DESCRIPTION } from "@/lib/trips";
import { seedFixtureTrip, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const db = createDb(env.DB);
const BISHOP = { userId: "owner", startDate: "2026-03-10", endDate: "2026-03-20" };
const LONG = `Ten days in the Buttermilks.\n${"Camped at the Pit. ".repeat(10)}`;

const statement = migration
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

it("leaves a description that fits on one line where the climber wrote it", async () => {
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

it("moves a description too long for the line into the notes, as it was written", async () => {
  expect(LONG.length).toBeGreaterThan(MAX_TRIP_DESCRIPTION);
  const trip = await seedFixtureTrip(db, { ...BISHOP, name: "Bishop", description: LONG });

  await env.DB.prepare(statement).run();
  await env.DB.prepare(statement).run();

  expect(await stored(trip.id)).toEqual({ description: null, notes: LONG });
});

it("overwrites no notes", async () => {
  const trip = await seedFixtureTrip(db, {
    ...BISHOP,
    name: "Bishop",
    description: LONG,
    notes: "# Day one",
  });

  await env.DB.prepare(statement).run();

  expect(await stored(trip.id)).toEqual({ description: LONG, notes: "# Day one" });
});

it("draws the line where the form does", () => {
  expect(statement).toContain(`length(description) > ${MAX_TRIP_DESCRIPTION}`);
});
