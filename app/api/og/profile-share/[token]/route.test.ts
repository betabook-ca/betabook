import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { getProfileShareToken, type UserStatsSummary } from "@/db/queries";
import { user } from "@/db/schema";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { BETTER_AUTH_URL: "https://betabook.test" } }),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

// Both vi.mock calls above are hoisted ahead of this import, same as any
// other, so the route sees the mocked @/db/client and @opennextjs/cloudflare.
import { GET, loadProfileShareCard, profileShareCardElement } from "./route";

const db = createDb(env.DB);
const GOOGLE_IMAGE = "https://lh3.googleusercontent.com/a/share-owner";

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "owner", name: "Share Owner", image: GOOGLE_IMAGE });
});

async function currentToken(id = "owner") {
  return (await getProfileShareToken(db, id))!;
}

describe("loadProfileShareCard", () => {
  it("names the owner and totals their sends for a current token on a public profile", async () => {
    await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2026-01-01" }); // V4 boulder, area 4
    await seedFixtureSend(db, { userId: "owner", climbId: 2, dateSent: "2026-02-01" }); // V1 boulder, area 5
    await seedFixtureSend(db, { userId: "owner", climbId: 3, dateSent: "2026-03-01" }); // 5.10a sport, area 3

    const card = await loadProfileShareCard(await currentToken());

    expect(card).toEqual({
      name: "Share Owner",
      initials: "SO",
      avatarUrl: GOOGLE_IMAGE,
      summary: {
        sendCount: 3,
        areaCount: 3,
        peakGrade: "V4",
        mostLoggedDiscipline: { type: "boulder", count: 2 },
        latestSendDate: "2026-03-01",
      },
    });
  });

  it("resolves a stored profile photo against the site origin", async () => {
    const key = "owner/0123456789abcdef0123456789abcdef.webp";
    await db
      .update(user)
      .set({ image: `/api/avatars/${key}` })
      .where(eq(user.id, "owner"));

    const card = await loadProfileShareCard(await currentToken());

    expect(card?.avatarUrl).toBe(`https://betabook.test/api/avatars/${key}`);
  });

  it("falls back to initials with no stored photo", async () => {
    await db.update(user).set({ image: null }).where(eq(user.id, "owner"));

    const card = await loadProfileShareCard(await currentToken());

    expect(card?.avatarUrl).toBeNull();
    expect(card?.initials).toBe("SO");
  });

  it("is null for a malformed token or one no link uses", async () => {
    expect(await loadProfileShareCard("not-a-token")).toBeNull();
    expect(await loadProfileShareCard("0".repeat(32))).toBeNull();
  });

  it("is null for a current token on a private profile", async () => {
    await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));

    expect(await loadProfileShareCard(await currentToken())).toBeNull();
  });

  it("is null for a token a reset has already replaced", async () => {
    const before = await currentToken();
    // Toggling private and back mints a new token (see db/queries/profile-share.test.ts).
    await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
    await db.update(user).set({ isPrivate: false }).where(eq(user.id, "owner"));

    expect(await loadProfileShareCard(before)).toBeNull();
    expect(await loadProfileShareCard(await currentToken())).toMatchObject({ name: "Share Owner" });
  });
});

describe("profileShareCardElement", () => {
  function summary(overrides: Partial<UserStatsSummary> = {}): UserStatsSummary {
    return {
      sendCount: 12,
      areaCount: 4,
      peakGrade: "V6",
      mostLoggedDiscipline: { type: "boulder", count: 9 },
      latestSendDate: "2026-01-01",
      ...overrides,
    };
  }

  it("renders the name, totals, discipline-labeled peak grade, and initials with no photo", () => {
    const json = JSON.stringify(
      profileShareCardElement({
        name: "Share Owner",
        initials: "SO",
        avatarUrl: null,
        summary: summary(),
      }),
    );

    // StatTile is an unrendered element here (no React renderer involved), so
    // its own output never appears in this JSON — only the props it was
    // given, which is exactly what wiring this card correctly requires.
    expect(json).toContain("Share Owner");
    expect(json).toContain('"value":"12"'); // sendCount
    expect(json).toContain('"value":"4"'); // areaCount
    expect(json).toContain('"value":"V6"'); // peakGrade
    expect(json).toContain("Peak · Boulder");
    expect(json).toContain('"photo":null,"initials":"SO"'); // initials shown in place of a photo
  });

  it("passes the avatar photo URL through when there's one on file", () => {
    const json = JSON.stringify(
      profileShareCardElement({
        name: "Share Owner",
        initials: "SO",
        avatarUrl: "https://betabook.test/api/avatars/owner/photo.webp",
        summary: summary(),
      }),
    );

    expect(json).toContain("https://betabook.test/api/avatars/owner/photo.webp");
  });

  it("shows a placeholder for a climber with no dated sends", () => {
    const json = JSON.stringify(
      profileShareCardElement({
        name: "New Climber",
        initials: "NC",
        avatarUrl: null,
        summary: summary({
          sendCount: 0,
          areaCount: 0,
          peakGrade: null,
          mostLoggedDiscipline: null,
        }),
      }),
    );

    expect(json).toContain("Peak grade");
    expect(json).toContain("—");
  });
});

describe("GET", () => {
  const request = (token: string) =>
    new Request(`https://betabook.test/api/og/profile-share/${token}`);
  const params = (token: string) => ({ params: Promise.resolve({ token }) });

  it("redirects an invalid token to the sitewide card instead of naming anyone", async () => {
    const response = await GET(request("not-a-token"), params("not-a-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("https://betabook.test/opengraph-image.png");
  });

  it("redirects a private profile's current token the same way", async () => {
    await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
    const token = await currentToken();

    const response = await GET(request(token), params(token));

    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("https://betabook.test/opengraph-image.png");
  });

  // A valid token's image branch calls next/og's `ImageResponse`, which
  // `vitest-pool-workers` cannot import (see the comment on
  // `loadProfileShareCard` in ./route.tsx) — covered instead by
  // `profileShareCardElement` above and by a real build/preview request.
});
