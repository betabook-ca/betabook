import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn<() => Promise<{ user: { id: string; role: string | null } } | null>>(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  initAuth: async () => ({ api: { getSession: getSessionMock } }),
}));

import { createDb } from "@/db/client";
import { user } from "@/db/schema";
import { NotAdminError, NotSignedInError } from "@/lib/action-result";
import { isAdmin, requireAdmin, requireSession } from "@/lib/session";
import { seedFixtureUser } from "@/test/fixtures";

vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

beforeEach(async () => {
  getSessionMock.mockReset();
  const db = createDb(env.DB);
  await db.delete(user);
  await seedFixtureUser(db, { id: "1" });
});

describe("requireSession", () => {
  it("throws NotSignedInError when there is no session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(requireSession()).rejects.toThrow(NotSignedInError);
  });

  it("returns the session when signed in", async () => {
    const session = { user: { id: "1", role: null } };
    getSessionMock.mockResolvedValueOnce(session);
    await expect(requireSession()).resolves.toBe(session);
  });
});

describe("requireAdmin", () => {
  it("throws NotSignedInError when there is no session at all", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(requireAdmin()).rejects.toThrow(NotSignedInError);
  });

  it("throws NotAdminError for a signed-in non-admin", async () => {
    getSessionMock.mockResolvedValueOnce({ user: { id: "1", role: null } });
    await expect(requireAdmin()).rejects.toThrow(NotAdminError);
  });

  it("returns the session for an admin", async () => {
    const session = { user: { id: "1", role: "admin" } };
    getSessionMock.mockResolvedValueOnce(session);
    await expect(requireAdmin()).resolves.toBe(session);
  });
});

describe("isAdmin", () => {
  it('is true only for role === "admin"', () => {
    expect(isAdmin({ user: { role: "admin" } })).toBe(true);
    expect(isAdmin({ user: { role: null } })).toBe(false);
    expect(isAdmin({ user: { role: "moderator" } })).toBe(false);
  });
});
