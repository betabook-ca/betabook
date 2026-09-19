import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createDb, type Database } from "@/db/client";
import { seedFixtureUser } from "@/test/fixtures";

import { getTakenNamesAround, getUser, getUserIdByName, getUsersByIds } from "./users";

let db: Database;

beforeAll(async () => {
  db = createDb(env.DB);
  await seedFixtureUser(db, { id: "test-user-1", name: "Alice Climber" });
});

describe("getUser", () => {
  it("returns the user for a known id", async () => {
    const user = await getUser(db, "test-user-1");
    expect(user?.name).toBe("Alice Climber");
  });

  it("returns undefined for an unknown id", async () => {
    const user = await getUser(db, "no-such-user");
    expect(user).toBeUndefined();
  });
});

describe("getUsersByIds", () => {
  const photo = "/api/avatars/queue-requester/abababababababababababababababab.webp";

  it("returns each requester's name and photo for the review queue", async () => {
    await seedFixtureUser(db, { id: "queue-requester", name: "Queue Requester", image: photo });
    await seedFixtureUser(db, { id: "queue-plain", name: "Queue Plain" });

    // The queue shows a face beside "Requested by", so the photo has to come
    // back from the same batch lookup as the name.
    expect(await getUsersByIds(db, ["queue-requester", "queue-plain", "no-such-user"])).toEqual([
      { id: "queue-plain", name: "Queue Plain", image: null },
      { id: "queue-requester", name: "Queue Requester", image: photo },
    ]);
  });

  it("returns nothing for an empty id list", async () => {
    expect(await getUsersByIds(db, [])).toEqual([]);
  });
});

describe("getUserIdByName", () => {
  it("matches case-insensitively, agreeing with user_name_unique_idx", async () => {
    expect(await getUserIdByName(db, "ALICE climber")).toBe("test-user-1");
  });

  it("returns null when nobody holds the name", async () => {
    expect(await getUserIdByName(db, "Nobody Here")).toBeNull();
  });
});

describe("getTakenNamesAround", () => {
  beforeAll(async () => {
    await seedFixtureUser(db, { id: "test-user-3", name: "Alice Climber 2" });
  });

  it("collects the base and its suffix candidates, lowercased and case-insensitively", async () => {
    const taken = await getTakenNamesAround(db, "ALICE CLIMBER", "ALICE CLIMBER");
    expect(taken).toEqual(new Set(["alice climber", "alice climber 2"]));
  });

  it("returns an empty set when nothing collides", async () => {
    expect(await getTakenNamesAround(db, "Nobody Here", "Nobody Here")).toEqual(new Set());
  });
});

describe("user_name_unique_idx (migration 0034)", () => {
  it("rejects a second user whose name differs only in case", async () => {
    await expect(seedFixtureUser(db, { id: "test-user-2", name: "alice climber" })).rejects.toThrow(
      /UNIQUE|Failed query/i,
    );
  });
});
