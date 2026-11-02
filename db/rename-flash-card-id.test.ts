import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { userAnalyticsLayouts } from "@/db/schema";
import migration from "@/drizzle/migrations/0057_rename_flash_card_id.sql?raw";
import { parseAnalyticsLayout } from "@/lib/analytics-layout";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const db = createDb(env.DB);
const statement = migration
  .split("\n")
  .filter((line) => !line.startsWith("--"))
  .join(" ")
  .trim();

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "renamed" });
  await seedFixtureUser(db, { id: "untouched" });
});

async function stored(userId: string) {
  const [row] = await db
    .select({ layout: userAnalyticsLayouts.layout })
    .from(userAnalyticsLayouts)
    .where(eq(userAnalyticsLayouts.userId, userId));
  return row.layout;
}

it("renames the saved flash card and leaves other ids and layouts alone", async () => {
  // Raw SQL: the column's type only admits current ids, and these rows predate the rename.
  const insert = env.DB.prepare(
    "INSERT INTO user_analytics_layouts (user_id, layout) VALUES (?, ?)",
  );
  await env.DB.batch([
    insert.bind(
      "renamed",
      JSON.stringify({
        cards: ["sends", "firstTry", "bestYear"],
        charts: ["flashRate", "pyramid"],
      }),
    ),
    insert.bind("untouched", JSON.stringify({ cards: ["hardest", "days"], charts: ["calendar"] })),
  ]);

  await env.DB.prepare(statement).run();

  const renamed = await stored("renamed");
  expect(renamed).toEqual({
    cards: ["sends", "flash", "bestYear"],
    charts: ["flashRate", "pyramid"],
  });
  expect(parseAnalyticsLayout(renamed)).toEqual(renamed);
  expect(await stored("untouched")).toEqual({ cards: ["hardest", "days"], charts: ["calendar"] });
});
