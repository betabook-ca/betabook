import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import { createDb } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { user } from "@/db/schema";
import { profileSharePath, profileShareShortPath } from "@/lib/profile-share";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});

import { GET } from "./route";

const db = createDb(env.DB);

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner", name: "Share Owner" });
});

function request(compactToken: string) {
  return GET(new Request(`https://betabook.test/s/${compactToken}`), {
    params: Promise.resolve({ token: compactToken }),
  });
}

async function currentToken() {
  return (await getProfileShareToken(db, "owner"))!;
}

it("redirects a current public link to the existing signed-out profile preview", async () => {
  const token = await currentToken();
  const compact = profileShareShortPath(token).split("/")[2];

  const response = await request(compact);

  expect(response.status).toBe(307);
  expect(response.headers.get("Location")).toBe(profileSharePath("owner", token));
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
});

it("returns 404 for malformed or unknown compact tokens", async () => {
  expect((await request("not-a-token")).status).toBe(404);
  expect((await request("A".repeat(22))).status).toBe(404);
});

it("returns 404 after the owner makes their profile private or resets the link", async () => {
  const original = profileShareShortPath(await currentToken()).split("/")[2];

  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
  expect((await request(original)).status).toBe(404);

  await db.update(user).set({ isPrivate: false }).where(eq(user.id, "owner"));
  expect((await request(original)).status).toBe(404);
  const replacement = profileShareShortPath(await currentToken()).split("/")[2];
  expect((await request(replacement)).status).toBe(307);
});
