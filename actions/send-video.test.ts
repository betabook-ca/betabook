import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createJournalEntry, createUndatedSend, getSendEditorData, updateSend } from "@/actions";
import { createDb } from "@/db/client";
import { journalEntries, sends } from "@/db/schema";
import { SEND_VIDEO_INVALID_MESSAGE } from "@/lib/send-video";
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
const HIGHBALL = 1;
const SLAB = 2;
const CRACK = 4;

function sendFormData(fields: Record<string, string>): FormData {
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
  expect(chain.join(" | ")).toMatch(/send video must be a YouTube or Instagram link/);
}

async function storedVideo(userId: string, climbId: number) {
  const row = await db
    .select({ videoUrl: sends.videoUrl })
    .from(sends)
    .where(and(eq(sends.userId, userId), eq(sends.climbId, climbId)))
    .get();
  return row?.videoUrl;
}

/** An undated send on `climbId` holding `videoUrl`, with nothing else on the climb. */
async function seedSend(climbId: number, videoUrl: string | null = null): Promise<number> {
  await db.delete(journalEntries).where(eq(journalEntries.climbId, climbId));
  await db.delete(sends).where(eq(sends.climbId, climbId));
  await seedFixtureSend(db, { userId: "video-user", climbId, dateSent: null, videoUrl });
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

describe("updateSend with a video", () => {
  it("stores the canonical form of a pasted link", async () => {
    const sendId = await seedSend(CRACK);

    const result = await updateSend(
      sendId,
      sendFormData({ suggestedGrade: "6", video: ` https://youtu.be/${YOUTUBE_ID}?t=12&si=x ` }),
    );

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await storedVideo("video-user", CRACK)).toBe(CANONICAL);
  });

  it("keeps the stored video when the form carries no video field", async () => {
    const sendId = await seedSend(CRACK, CANONICAL);

    const result = await updateSend(sendId, sendFormData({ suggestedGrade: "6", rating: "4" }));

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await storedVideo("video-user", CRACK)).toBe(CANONICAL);
  });

  it("removes the video when the field is sent empty", async () => {
    const sendId = await seedSend(CRACK, CANONICAL);

    const result = await updateSend(sendId, sendFormData({ suggestedGrade: "6", video: "" }));

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await storedVideo("video-user", CRACK)).toBeNull();
  });

  it("refuses an unsupported link and leaves the send as it was", async () => {
    const sendId = await seedSend(CRACK, CANONICAL);

    const result = await updateSend(
      sendId,
      sendFormData({ suggestedGrade: "6", rating: "5", video: "https://vimeo.com/12345" }),
    );

    expect(result).toEqual({ ok: false, error: SEND_VIDEO_INVALID_MESSAGE });
    const row = await db.select().from(sends).where(eq(sends.id, sendId)).get();
    expect(row).toMatchObject({ videoUrl: CANONICAL, rating: null });
  });

  it("won't set a video on another climber's send", async () => {
    const sendId = await seedSend(CRACK, CANONICAL);
    sessionState.userId = "other-user";

    const result = await updateSend(
      sendId,
      sendFormData({ suggestedGrade: "6", video: "https://www.instagram.com/reel/C9Xq3uGxJ5R/" }),
    );

    expect(result).toEqual({ ok: false, error: "Send not found" });
    expect(await storedVideo("video-user", CRACK)).toBe(CANONICAL);
  });

  it("hands the stored video to the owner's editor", async () => {
    const sendId = await seedSend(CRACK, CANONICAL);

    const result = await getSendEditorData({ sendId });

    expect(result.ok && result.value.send.videoUrl).toBe(CANONICAL);
  });
});

describe("logging a new send with a video", () => {
  it("stores the video on an ascent logged through the journal", async () => {
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
      video: "https://www.instagram.com/some.climber/reel/C9Xq3uGxJ5R/?igsh=abc",
    })) {
      formData.set(key, value);
    }

    const result = await createJournalEntry(formData);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await storedVideo("video-user", HIGHBALL)).toBe(
      "https://www.instagram.com/reel/C9Xq3uGxJ5R/",
    );
  });

  it("stores the video on an undated send", async () => {
    await db.delete(journalEntries).where(eq(journalEntries.climbId, SLAB));
    await db.delete(sends).where(eq(sends.climbId, SLAB));
    const formData = sendFormData({
      climbId: String(SLAB),
      suggestedGrade: "2",
      video: `https://www.youtube.com/shorts/${YOUTUBE_ID}`,
    });

    const result = await createUndatedSend(formData);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(await storedVideo("video-user", SLAB)).toBe(
      `https://www.youtube.com/shorts/${YOUTUBE_ID}`,
    );
  });

  it("refuses a new ascent whose video link is unsupported, writing nothing", async () => {
    await db.delete(journalEntries).where(eq(journalEntries.climbId, SLAB));
    await db.delete(sends).where(eq(sends.climbId, SLAB));
    const formData = sendFormData({
      climbId: String(SLAB),
      suggestedGrade: "2",
      video: "https://www.tiktok.com/@a/video/1",
    });

    expect(await createUndatedSend(formData)).toEqual({
      ok: false,
      error: SEND_VIDEO_INVALID_MESSAGE,
    });
    expect(await db.select().from(sends).where(eq(sends.climbId, SLAB)).all()).toEqual([]);
  });
});

describe("sends.video_url backstop", () => {
  it.each([
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>',
    "javascript:alert(1)",
    `https://www.instagram.com/reel/${"a".repeat(120)}/`,
  ])("rejects a direct write of %j", async (videoUrl) => {
    const sendId = await seedSend(CRACK, CANONICAL);

    await expectVideoRejection(
      db.update(sends).set({ videoUrl }).where(eq(sends.id, sendId)).run(),
    );
    await expectVideoRejection(
      seedFixtureSend(db, { userId: "other-user", climbId: CRACK, dateSent: null, videoUrl }),
    );
    expect(await storedVideo("video-user", CRACK)).toBe(CANONICAL);
    expect(await storedVideo("other-user", CRACK)).toBeUndefined();
  });

  it("accepts every canonical form the app writes", async () => {
    const sendId = await seedSend(CRACK);
    for (const videoUrl of [
      CANONICAL,
      `https://www.youtube.com/shorts/${YOUTUBE_ID}`,
      "https://www.instagram.com/reel/C9Xq3uGxJ5R/",
      "https://www.instagram.com/p/C9Xq-3uGx_J5R/",
      null,
    ]) {
      await db.update(sends).set({ videoUrl }).where(eq(sends.id, sendId)).run();
      expect(await storedVideo("video-user", CRACK)).toBe(videoUrl);
    }
  });
});
