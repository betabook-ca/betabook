import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { seedFixtureSend, seedFixtureTree, seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const identity = vi.hoisted(() => ({ id: "owner" as string | null }));
vi.mock("@/lib/session", () => ({
  getSession: async () => (identity.id ? { user: { id: identity.id } } : null),
}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ cf: { timezone: "America/Vancouver" }, env: {} }),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

// The vi.mock calls above are hoisted ahead of this import, same as any
// other, so the route sees the mocked session, @opennextjs/cloudflare and
// @/db/client.
import { GET, loadSocialCardStats, socialCardElement, todayInTimezone } from "./route";

const db = createDb(env.DB);

beforeEach(async () => {
  identity.id = "owner";
  await resetDb(db);
  await seedFixtureTree(db);
  await seedFixtureUser(db, { id: "owner", name: "Share Owner" });
  await seedFixtureUser(db, { id: "other", name: "Other Climber" });
});

describe("todayInTimezone", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 11pm Vancouver time is already the next UTC day.
    vi.setSystemTime(new Date("2026-09-15T23:30:00-07:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("uses the given timezone's calendar date, not UTC's", () => {
    expect(todayInTimezone("America/Vancouver")).toBe("2026-09-15");
    expect(todayInTimezone("UTC")).toBe("2026-09-16");
  });

  it("falls back to UTC with no timezone", () => {
    expect(todayInTimezone(undefined)).toBe("2026-09-16");
  });
});

describe("loadSocialCardStats", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-15T12:00:00-07:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("scopes a climber's own sends to the requested period", async () => {
    // Both boulder sends, so period filtering is what's under test here —
    // lib/social-card.test.ts covers combining every discipline.
    await seedFixtureSend(db, { userId: "owner", climbId: 1, dateSent: "2026-09-01" }); // this month
    await seedFixtureSend(db, { userId: "owner", climbId: 2, dateSent: "2025-01-01" }); // last year

    expect((await loadSocialCardStats("owner", "month")).sendCount).toBe(1);
    expect((await loadSocialCardStats("owner", "all")).sendCount).toBe(2);
  });

  it("never mixes in another climber's sends", async () => {
    await seedFixtureSend(db, { userId: "other", climbId: 1, dateSent: "2026-09-01" });

    expect((await loadSocialCardStats("owner", "all")).sendCount).toBe(0);
  });
});

describe("socialCardElement", () => {
  const baseStats = {
    period: "year" as const,
    periodLabel: "2026",
    sendCount: 24,
    daysOut: 10,
    hardest: [
      { type: "boulder" as const, label: "V6", climbName: "Test Highball" },
      { type: "sport" as const, label: "5.12a", climbName: "Test Sport Route" },
    ],
    areaCount: 3,
    topArea: { name: "Test Boulders" },
    flashPct: 40,
    longestStreak: 5,
  };

  it("renders the climber's name and totals for an active period, one hardest badge per discipline", () => {
    const json = JSON.stringify(socialCardElement("Share Owner", baseStats));

    // Tile/GradeBadge are unrendered elements here (no React renderer
    // involved), so their own output never appears in this JSON — only the
    // props they were given, which is exactly what wiring this card
    // correctly requires.
    expect(json).toContain("Share Owner");
    expect(json).toContain('"children":24'); // the literal sendCount, not stringified
    expect(json).toContain('"hardest":{"type":"boulder","label":"V6"'); // boulder badge
    expect(json).toContain('"hardest":{"type":"sport","label":"5.12a"'); // sport badge
    expect(json).toContain('"sub":"Test Boulders"'); // topArea.name
    expect(json).toContain('"sub":"5-day streak"');
    expect(json).toContain("2026");
    expect(json).not.toContain("Boulder · "); // no discipline in the eyebrow — it's a combined recap
  });

  it("skips the hardest-badge row entirely when nothing was graded", () => {
    const json = JSON.stringify(socialCardElement("Share Owner", { ...baseStats, hardest: [] }));

    expect(json).not.toContain("GradeBadge");
    expect(json).not.toContain('"hardest"');
  });

  it("renders a friendly empty state instead of zeroed-out tiles", () => {
    const json = JSON.stringify(
      socialCardElement("New Climber", {
        period: "month",
        periodLabel: "Sep 2026",
        sendCount: 0,
        daysOut: 0,
        hardest: [],
        areaCount: 0,
        topArea: null,
        flashPct: null,
        longestStreak: null,
      }),
    );

    expect(json).toContain("No sends logged yet");
    expect(json).toContain("New Climber");
    expect(json).toContain("Sep 2026");
    expect(json).not.toContain("—"); // no dashed-out tiles in the friendly empty state
  });
});

describe("GET", () => {
  const request = (id: string, period?: string) =>
    new Request(
      `https://betabook.test/api/og/stats-card/${id}${period ? `?period=${period}` : ""}`,
    );
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it("requires sign-in", async () => {
    identity.id = null;

    const response = await GET(request("owner"), params("owner"));

    expect(response.status).toBe(401);
  });

  it("refuses to card anyone but the signed-in climber themself", async () => {
    identity.id = "other";

    const response = await GET(request("owner"), params("owner"));

    expect(response.status).toBe(404);
  });

  // The success path calls next/og's `ImageResponse`, which
  // `vitest-pool-workers` cannot import — see the comment on
  // `loadSocialCardStats` in ./route.tsx. Covered by `socialCardElement`
  // above and by a real build/preview request.
});
