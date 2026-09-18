import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetProfileShareLink,
  setJournalVisibility,
  setSendCommentVisibility,
  setShowProfilePhoto,
  setUserPrivate,
} from "@/actions";
import { createDb } from "@/db/client";
import { getProfileShareToken, getShareLinkOwner } from "@/db/queries";
import { user } from "@/db/schema";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/action-result";
import { seedFixtureUser } from "@/test/fixtures";

const sessionState = vi.hoisted(() => ({ userId: "test-user" as string | null }));

vi.mock("next/cache", () => ({
  refresh: () => {},
  revalidatePath: () => {},
}));

vi.mock("@/lib/session", async () => {
  const { NotSignedInError } = await import("@/lib/action-result");
  return {
    getSession: async () => (sessionState.userId ? { user: { id: sessionState.userId } } : null),
    requireSession: async () => {
      if (!sessionState.userId) throw new NotSignedInError();
      return { user: { id: sessionState.userId } };
    },
  };
});

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return {
    ...actual,
    getDb: async () => actual.createDb(env.DB),
  };
});

const db = createDb(env.DB);

beforeEach(async () => {
  sessionState.userId = "test-user";
  await db.delete(user);
  await seedFixtureUser(db, { id: "test-user", isPrivate: false, journalVisibility: "private" });
  await seedFixtureUser(db, { id: "other-user", isPrivate: false, journalVisibility: "private" });
});

async function privacy() {
  return db
    .select({
      id: user.id,
      isPrivate: user.isPrivate,
      journalVisibility: user.journalVisibility,
      sendCommentVisibility: user.sendCommentVisibility,
    })
    .from(user)
    .orderBy(user.id);
}

describe("setUserPrivate action boundary", () => {
  it("returns ok:false with the friendly session message when signed out", async () => {
    const before = await privacy();
    sessionState.userId = null;
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const result = await setUserPrivate(true);
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    expect(await privacy()).toEqual(before);
  });

  it("flips the signed-in user's isPrivate flag on", async () => {
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const result = await setUserPrivate(true);
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: true, value: undefined });

    const row = await db.select().from(user).where(eq(user.id, "test-user")).get();
    expect(row?.isPrivate).toBe(true);
  });

  it("flips the signed-in user's isPrivate flag back off", async () => {
    await db.update(user).set({ isPrivate: true });
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const result = await setUserPrivate(false);
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: true, value: undefined });

    const row = await db.select().from(user).where(eq(user.id, "test-user")).get();
    expect(row?.isPrivate).toBe(false);
  });
});

describe("setShowProfilePhoto action boundary", () => {
  const PHOTO = "https://lh3.googleusercontent.com/a/avatar=s96-c";

  beforeEach(async () => {
    await db.update(user).set({ image: PHOTO });
  });

  it("requires a signed-in user and leaves the stored choice alone", async () => {
    sessionState.userId = null;
    const before = await db.select().from(user).orderBy(user.id).all();

    const result = await setShowProfilePhoto(false);

    expect(result).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    expect(await db.select().from(user).orderBy(user.id).all()).toEqual(before);
  });

  it("hides only the signed-in climber's photo, keeping the URL so it can come back", async () => {
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();

    const result = await setShowProfilePhoto(false);

    expect(result).toEqual({ ok: true, value: undefined });
    const row = await db.select().from(user).where(eq(user.id, "test-user")).get();
    expect(row?.showProfilePhoto).toBe(false);
    // The opt-out must not clear image: turning it back on restores this photo,
    // and a later Google sign-in would otherwise be the only way to recover it.
    expect(row?.image).toBe(PHOTO);
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
  });

  it("shows the photo again without a fresh sign-in", async () => {
    await db.update(user).set({ showProfilePhoto: false }).where(eq(user.id, "test-user"));

    const result = await setShowProfilePhoto(true);

    expect(result).toEqual({ ok: true, value: undefined });
    const row = await db.select().from(user).where(eq(user.id, "test-user")).get();
    expect(row?.showProfilePhoto).toBe(true);
    expect(row?.image).toBe(PHOTO);
  });

  it("defaults a new account to showing its photo", async () => {
    await seedFixtureUser(db, { id: "fresh-user", image: PHOTO });
    const row = await db.select().from(user).where(eq(user.id, "fresh-user")).get();
    expect(row?.showProfilePhoto).toBe(true);
  });
});

describe("setJournalVisibility action boundary", () => {
  it("requires a signed-in user", async () => {
    const before = await privacy();
    sessionState.userId = null;
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const result = await setJournalVisibility("public");
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    expect(await privacy()).toEqual(before);
  });

  it("publishes the signed-in user's journal", async () => {
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const result = await setJournalVisibility("public");
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: true, value: undefined });

    const row = await db.select().from(user).where(eq(user.id, "test-user")).get();
    expect(row?.journalVisibility).toBe("public");
  });

  it("makes the signed-in user's journal private again", async () => {
    await db.update(user).set({ journalVisibility: "public" });
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const result = await setJournalVisibility("private");
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: true, value: undefined });

    const row = await db.select().from(user).where(eq(user.id, "test-user")).get();
    expect(row?.journalVisibility).toBe("private");
  });

  it("rejects an invalid visibility", async () => {
    const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
    const before = await privacy();
    const result = await setJournalVisibility("invalid");
    expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
      otherBefore,
    );
    expect(result).toEqual({ ok: false, error: "Invalid sharing audience" });
    expect(await privacy()).toEqual(before);
  });

  it("rejects Everyone, which only send commentary offers", async () => {
    const before = await privacy();
    expect(await setJournalVisibility("everyone")).toEqual({
      ok: false,
      error: "Invalid sharing audience",
    });
    expect(await privacy()).toEqual(before);
  });
});

it("saves Friends sharing without accepting a pending request or changing the other account", async () => {
  const { friendships } = await import("@/db/schema");
  await db
    .insert(friendships)
    .values({ userId: "other-user", friendId: "test-user", requestedBy: "other-user" });
  const before = await db.select().from(friendships);
  const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
  expect(await setJournalVisibility("friends")).toEqual({ ok: true, value: undefined });
  expect(
    (await db.select().from(user).where(eq(user.id, "test-user")).get())?.journalVisibility,
  ).toBe("friends");
  expect(await db.select().from(friendships)).toEqual(before);
  expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(otherBefore);
});

describe("independent send commentary audience", () => {
  it.each(["private", "friends", "public", "everyone"] as const)(
    "saves %s commentary without changing the journal, profile, other account, or pending requests",
    async (audience) => {
      const { friendships } = await import("@/db/schema");
      await db
        .insert(friendships)
        .values({ userId: "other-user", friendId: "test-user", requestedBy: "other-user" });
      await db
        .update(user)
        .set({
          journalVisibility: "friends",
          sendCommentVisibility: audience === "public" ? "private" : "public",
        })
        .where(eq(user.id, "test-user"));
      const otherBefore = await db.select().from(user).where(eq(user.id, "other-user")).get();
      const requestsBefore = await db.select().from(friendships);
      expect(await setSendCommentVisibility(audience)).toEqual({ ok: true, value: undefined });
      expect(await db.select().from(user).where(eq(user.id, "test-user")).get()).toMatchObject({
        journalVisibility: "friends",
        sendCommentVisibility: audience,
        isPrivate: false,
      });
      expect(await db.select().from(user).where(eq(user.id, "other-user")).get()).toEqual(
        otherBefore,
      );
      expect(await db.select().from(friendships)).toEqual(requestsBefore);
    },
  );

  it("does not change send commentary when the journal audience changes", async () => {
    await db.update(user).set({ sendCommentVisibility: "public" }).where(eq(user.id, "test-user"));
    expect(await setJournalVisibility("friends")).toEqual({ ok: true, value: undefined });
    expect(await db.select().from(user).where(eq(user.id, "test-user")).get()).toMatchObject({
      journalVisibility: "friends",
      sendCommentVisibility: "public",
    });
  });

  it("keeps both saved audiences when profile privacy is enabled and disabled", async () => {
    await db
      .update(user)
      .set({ journalVisibility: "friends", sendCommentVisibility: "public" })
      .where(eq(user.id, "test-user"));
    for (const isPrivate of [true, false]) {
      expect(await setUserPrivate(isPrivate)).toEqual({ ok: true, value: undefined });
      expect(await db.select().from(user).where(eq(user.id, "test-user")).get()).toMatchObject({
        isPrivate,
        journalVisibility: "friends",
        sendCommentVisibility: "public",
      });
    }
  });

  it("rejects invalid commentary audiences without any saved changes", async () => {
    const before = await privacy();
    expect(await setSendCommentVisibility("invalid")).toEqual({
      ok: false,
      error: "Invalid sharing audience",
    });
    expect(await privacy()).toEqual(before);
  });

  it("requires authentication and leaves stored privacy unchanged", async () => {
    const before = await privacy();
    sessionState.userId = null;
    expect(await setSendCommentVisibility("public")).toEqual({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE,
    });
    expect(await privacy()).toEqual(before);
  });
});

describe("profile share links", () => {
  const TOKEN = /^[0-9a-f]{32}$/;

  async function tokens() {
    return [
      await getProfileShareToken(db, "test-user"),
      await getProfileShareToken(db, "other-user"),
    ];
  }

  it("resets only the signed-in user's link", async () => {
    const [before, otherBefore] = await tokens();

    expect(await resetProfileShareLink()).toEqual({ ok: true, value: undefined });

    const [after, otherAfter] = await tokens();
    expect(after).toMatch(TOKEN);
    expect(after).not.toBe(before);
    expect(await getShareLinkOwner(db, before!)).toBeNull();
    expect(await getShareLinkOwner(db, after!)).toMatchObject({ id: "test-user" });
    expect(otherAfter).toBe(otherBefore);
  });

  it("requires a signed-in user and leaves every link unchanged", async () => {
    const before = await tokens();
    expect(before).toEqual([expect.stringMatching(TOKEN), expect.stringMatching(TOKEN)]);
    sessionState.userId = null;

    expect(await resetProfileShareLink()).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE });
    expect(await tokens()).toEqual(before);
  });

  it("invalidates the current link when the profile goes private", async () => {
    const [before] = await tokens();

    expect(await setUserPrivate(true)).toEqual({ ok: true, value: undefined });
    expect(await setUserPrivate(false)).toEqual({ ok: true, value: undefined });

    const [after] = await tokens();
    expect(await getShareLinkOwner(db, before!)).toBeNull();
    expect(await getShareLinkOwner(db, after!)).toMatchObject({ id: "test-user" });
  });
});
