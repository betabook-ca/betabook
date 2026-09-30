import { env } from "cloudflare:test";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createJournalEntry, createUndatedSend, getSendEditorData, updateSend } from "@/actions";
import { createDb } from "@/db/client";
import { journalEntries, sends } from "@/db/schema";
import { SEND_VIDEO_INVALID_MESSAGE, SEND_VIDEO_LIMIT_MESSAGE } from "@/lib/send-video";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";

const sessionState = vi.hoisted(() => ({ userId: "video-user" as string | null }));

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

vi.mock("@/lib/rate-limit", () => ({
  allowJournalWrite: async () => true,
}));

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

const db = createDb(env.DB);

const YOUTUBE_ID = "dQw4w9WgXcQ";
const CANONICAL = `https://www.youtube.com/watch?v=${YOUTUBE_ID}&t=12s`;
const REEL = "https://www.instagram.com/reel/C9Xq3uGxJ5R/";
const SHORT = `https://www.youtube.com/shorts/${YOUTUBE_ID}`;
const HIGHBALL = 1;
const SLAB = 2;
const CRACK = 4;

/** A send form. `videos` sends the video list (with its `videosChanged`
 * marker); leave it out for a form that doesn't carry one. */
function sendFormData(fields: Record<string, string>, videos?: string[]): FormData {
  const formData = new FormData();
  const values: Record<string, string> = {
    ascentStyle: "redpoint",
    dateSent: "",
    comment: "",
    rating: "",
    suggestedGrade: "5",
    gradeFeel: "solid",
    ...fields,
  };
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  if (videos) {
    formData.set("videosChanged", "true");
    for (const video of videos) formData.append("video", video);
  }
  return formData;
}

/** Drizzle's own message is the failing SQL; the trigger's reason sits
 * further down the `cause` chain. */
async function expectVideoRejection(statement: Promise<unknown>) {
  const error = await statement.then(
    () => {
      throw new Error("expected the video guard to reject this statement");
    },
    (err: unknown) => err,
  );
  const chain: string[] = [];
  for (let cur = error; cur instanceof Error; cur = cur.cause) chain.push(cur.message);
  expect(chain.join(" | ")).toMatch(/send videos must be up to five YouTube or Instagram links/);
}

async function storedVideos(userId: string, climbId: number) {
  const row = await db
    .select({ videos: sends.videos })
    .from(sends)
    .where(and(eq(sends.userId, userId), eq(sends.climbId, climbId)))
    .get();
  return row?.videos;
}

/** An undated send on `climbId` holding `videos`, with nothing else on the climb. */
async function seedSend(climbId: number, videos: string[] | null = null): Promise<number> {
  await db.delete(journalEntries).where(eq(journalEntries.climbId, climbId));
  await db.delete(sends).where(eq(sends.climbId, climbId));
  await seedFixtureSend(db, { userId: "video-user", climbId, dateSent: null, videos });
  const row = await db.select({ id: sends.id }).from(sends).where(eq(sends.climbId, climbId)).get();
  return row!.id;
}

beforeAll(async () => {
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "video-user" });
  await seedFixtureUser(db, { id: "other-user" });
});

beforeEach(() => {
  sessionState.userId = "video-user";
});

describe("updateSend with videos", () => {
  it("stores the canonical form of each pasted link, in order, once each", async () => {
    const sendId = await seedSend(CRACK);

    const result = await updateSend(
      sendId,
      sendFormData({ suggestedGrade: "6" }, [
        ` https://youtu.be/${YOUTUBE_ID}?t=12&si=x `,
        "",
        "instagram.com/some.climber/reel/C9Xq3uGxJ5R/?igsh=abc",
        CANONICAL,
      ]),
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await storedVideos("video-user", CRACK)).toEqual([CANONICAL, REEL]);
  });

  it("keeps the stored videos when the form carries no video list", async () => {
    const sendId = await seedSend(CRACK, [CANONICAL, REEL]);

    const result = await updateSend(sendId, sendFormData({ suggestedGrade: "6", rating: "4" }));

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await storedVideos("video-user", CRACK)).toEqual([CANONICAL, REEL]);
  });

  it("removes every video when the list is sent empty", async () => {
    const sendId = await seedSend(CRACK, [CANONICAL, REEL]);

    const result = await updateSend(sendId, sendFormData({ suggestedGrade: "6" }, [""]));

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await storedVideos("video-user", CRACK)).toBeNull();
  });

  it.each([
    [[REEL, "https://vimeo.com/12345"], SEND_VIDEO_INVALID_MESSAGE],
    [
      [
        "AAAAAAAAAAA",
        "BBBBBBBBBBB",
        "CCCCCCCCCCC",
        "DDDDDDDDDDD",
        "EEEEEEEEEEE",
        "FFFFFFFFFFF",
      ].map((id) => `https://youtu.be/${id}`),
      SEND_VIDEO_LIMIT_MESSAGE,
    ],
  ])("refuses %j and leaves the send as it was", async (videos, error) => {
    const sendId = await seedSend(CRACK, [CANONICAL]);

    const result = await updateSend(
      sendId,
      sendFormData({ suggestedGrade: "6", rating: "5" }, videos),
    );

    expect(result).toEqual({ ok: false, error });
    const row = await db.select().from(sends).where(eq(sends.id, sendId)).get();
    expect(row).toMatchObject({ videos: [CANONICAL], rating: null });
  });

  it("won't set videos on another climber's send", async () => {
    const sendId = await seedSend(CRACK, [CANONICAL]);
    sessionState.userId = "other-user";

    const result = await updateSend(sendId, sendFormData({ suggestedGrade: "6" }, [REEL]));

    expect(result).toEqual({ ok: false, error: "Send not found" });
    expect(await storedVideos("video-user", CRACK)).toEqual([CANONICAL]);
  });

  it("hands the stored videos to the owner's editor", async () => {
    const sendId = await seedSend(CRACK, [CANONICAL, REEL]);

    const result = await getSendEditorData({ sendId });

    expect(result.ok && result.value.send.videos).toEqual([CANONICAL, REEL]);
  });
});

describe("logging a new send with videos", () => {
  it("stores the videos on an ascent logged through the journal", async () => {
    await db.delete(journalEntries).where(eq(journalEntries.climbId, HIGHBALL));
    await db.delete(sends).where(eq(sends.climbId, HIGHBALL));
    const formData = new FormData();
    for (const [key, value] of Object.entries({
      kind: "session",
      climbId: String(HIGHBALL),
      sent: "true",
      entryDate: "2026-03-01",
      body: "Finally.",
      ascentStyle: "flash",
      rating: "",
      suggestedGrade: "5",
      gradeFeel: "solid",
      videosChanged: "true",
    })) {
      formData.set(key, value);
    }
    formData.append("video", "https://www.instagram.com/some.climber/reel/C9Xq3uGxJ5R/?igsh=abc");
    formData.append("video", SHORT);

    const result = await createJournalEntry(formData);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await storedVideos("video-user", HIGHBALL)).toEqual([REEL, SHORT]);
  });

  it("stores the videos on an undated send", async () => {
    await db.delete(journalEntries).where(eq(journalEntries.climbId, SLAB));
    await db.delete(sends).where(eq(sends.climbId, SLAB));

    const result = await createUndatedSend(
      sendFormData({ climbId: String(SLAB), suggestedGrade: "2" }, [SHORT]),
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await storedVideos("video-user", SLAB)).toEqual([SHORT]);
  });

  it("refuses a new ascent with an unsupported video link, writing nothing", async () => {
    await db.delete(journalEntries).where(eq(journalEntries.climbId, SLAB));
    await db.delete(sends).where(eq(sends.climbId, SLAB));

    const result = await createUndatedSend(
      sendFormData({ climbId: String(SLAB), suggestedGrade: "2" }, [
        "https://www.tiktok.com/@a/video/1",
      ]),
    );

    expect(result).toEqual({ ok: false, error: SEND_VIDEO_INVALID_MESSAGE });
    expect(await db.select().from(sends).where(eq(sends.climbId, SLAB)).all()).toEqual([]);
  });
});

describe("sends.videos backstop", () => {
  it.each([
    ["an empty list", []],
    ["six links", Array.from({ length: 6 }, () => CANONICAL)],
    ["another host", ["https://evil.example/watch?v=dQw4w9WgXcQ"]],
    ["markup", ['https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>']],
    ["a script scheme", ["javascript:alert(1)"]],
    ["an overlong link", [`https://www.instagram.com/reel/${"a".repeat(120)}/`]],
  ])("rejects a direct write of %s", async (_label, videos) => {
    const sendId = await seedSend(CRACK, [CANONICAL]);

    await expectVideoRejection(db.update(sends).set({ videos }).where(eq(sends.id, sendId)).run());
    await expectVideoRejection(
      seedFixtureSend(db, { userId: "other-user", climbId: CRACK, dateSent: null, videos }),
    );
    expect(await storedVideos("video-user", CRACK)).toEqual([CANONICAL]);
    expect(await storedVideos("other-user", CRACK)).toBeUndefined();
  });

  it("rejects a value that isn't a list of links", async () => {
    const sendId = await seedSend(CRACK, [CANONICAL]);
    for (const value of ['"https://www.youtube.com/"', "[1]", '{"a":1}', "not json"]) {
      await expectVideoRejection(
        db.run(sql`UPDATE sends SET videos = ${value} WHERE id = ${sendId}`),
      );
    }
    expect(await storedVideos("video-user", CRACK)).toEqual([CANONICAL]);
  });

  it("accepts every canonical form the app writes, up to five", async () => {
    const sendId = await seedSend(CRACK);
    for (const videos of [
      [CANONICAL, SHORT, REEL, "https://www.instagram.com/p/C9Xq-3uGx_J5R/", CANONICAL],
      [REEL],
      null,
    ]) {
      await db.update(sends).set({ videos }).where(eq(sends.id, sendId)).run();
      expect(await storedVideos("video-user", CRACK)).toEqual(videos);
    }
  });
});
