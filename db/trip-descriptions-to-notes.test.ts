import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { trips } from "@/db/schema";
import migration from "@/drizzle/migrations/0053_trip_descriptions_to_notes.sql?raw";
import { seedFixtureTrip, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const db = createDb(env.DB);
const BISHOP = { userId: "owner", startDate: "2026-03-10", endDate: "2026-03-20" };

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

it("moves what was written for the owner alone behind the journal's audience", async () => {
  const written = await seedFixtureTrip(db, {
    ...BISHOP,
    name: "Bishop",
    description: "Went with Sam and Priya.\nTwo rest days for the storm.",
  });
  const bare = await seedFixtureTrip(db, { ...BISHOP, name: "Squamish", description: null });

  await env.DB.prepare(statement).run();

  expect(await stored(written.id)).toEqual({
    description: null,
    notes: "Went with Sam and Priya.\nTwo rest days for the storm.",
  });
  expect(await stored(bare.id)).toEqual({ description: null, notes: null });
});

it("leaves a trip that already has notes as it is, so a second run changes nothing", async () => {
  const trip = await seedFixtureTrip(db, {
    ...BISHOP,
    name: "Bishop",
    description: "Ten days in the Buttermilks.",
    notes: "# Day one",
  });

  await env.DB.prepare(statement).run();
  await env.DB.prepare(statement).run();

  expect(await stored(trip.id)).toEqual({
    description: "Ten days in the Buttermilks.",
    notes: "# Day one",
  });
});
