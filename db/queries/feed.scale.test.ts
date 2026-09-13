import { env } from "cloudflare:test";
import { expect, it } from "vitest";

import { createDb } from "@/db/client";
import {
  seedFixtureUser,
  seedManyFriendships,
  seedManyJournalEntries,
  seedManyUsers,
} from "@/test/fixtures";
import { explainQueries } from "@/test/query-plans";
import { resetDb } from "@/test/reset-db";

import { getFeedPage } from "./feed";

const LONG_NOTE = "Long note ".repeat(200);

it("bounds busy-day previews across many friends' histories using author indexes", async () => {
  const db = createDb(env.DB);
  await resetDb(db);
  await seedFixtureUser(db, { id: "viewer" });
  const authors = Array.from({ length: 25 }, (_, i) => `author-${String(i).padStart(2, "0")}`);
  await seedManyUsers(
    db,
    authors.map((id) => ({ id, journalVisibility: "public" as const })),
  );
  await seedManyFriendships(db, "viewer", authors);
  await seedManyJournalEntries(db, [
    ...authors.flatMap((id, author) =>
      Array.from({ length: 30 }, (_, i) => ({
        userId: id,
        kind: "training" as const,
        entryDate: `2026-08-${String(i + 1).padStart(2, "0")}`,
        body: `Training ${author}/${i + 1}`,
      })),
    ),
    // One day far busier than the page size, to prove previews stay capped.
    ...Array.from({ length: 300 }, () => ({
      userId: "author-24",
      kind: "training" as const,
      entryDate: "2026-09-01",
      body: LONG_NOTE,
    })),
  ]);
  const page = await getFeedPage(db, "viewer", "all", null, 2);
  expect(page.days.map((day) => [day.userId, day.date])).toEqual([
    ["author-24", "2026-09-01"],
    ["author-24", "2026-08-30"],
  ]);
  expect(page.days[0].training).toBe(300);
  expect(page.days[0].activities).toHaveLength(3);
  expect(page.days[0].activities[0].body).toBe(`${LONG_NOTE.slice(0, 240)}…`);
  expect(page.hasMore).toBe(true);
  const next = await getFeedPage(
    db,
    "viewer",
    "all",
    { version: 1, view: "all", date: "2026-08-30", userId: "author-24" },
    2,
  );
  expect(next.days.map((day) => day.userId)).toEqual(["author-23", "author-22"]);
  const plans = await explainQueries(db, () => getFeedPage(db, "viewer"));
  const detail = plans
    .flat()
    .map((row) => row.detail)
    .join("\n");
  expect(detail).toMatch(/friendships/);
  expect(detail).toMatch(/journal_user_(date|climb)_idx/);
});
