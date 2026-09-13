import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import AccountPage from "@/app/account/page";
import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import { createDb } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { user } from "@/db/schema";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const session = vi.hoisted(() => ({ userId: "owner" }));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { BETTER_AUTH_URL: "https://betabook.test" } }),
}));
vi.mock("@/db/client", async (original) => {
  const actual = await original<typeof import("@/db/client")>();
  const { env } = await import("cloudflare:test");
  return { ...actual, getDb: async () => actual.createDb(env.DB) };
});
vi.mock("@/lib/session", () => ({
  getMemberSession: async () => ({
    user: { id: session.userId, name: "Viewer", email: "viewer@example.com", image: null },
  }),
  isAdmin: () => false,
}));
vi.mock("@/lib/auth", () => ({ getTurnstileSiteKey: async () => null }));

const db = createDb(env.DB);

beforeEach(async () => {
  session.userId = "owner";
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner", name: "Share Owner" });
  await seedFixtureUser(db, { id: "member", name: "Member Viewer" });
});

async function currentToken() {
  return (await getProfileShareToken(db, "owner"))!;
}

async function profileHeaderFor(viewerId: string) {
  const owner = (await db.select().from(user).where(eq(user.id, "owner")).get())!;
  return JSON.stringify(await ProfileHeader({ user: owner, viewerId }));
}

it("gives the share link to the profile's owner and no other member", async () => {
  const token = await currentToken();

  expect(await profileHeaderFor("owner")).toContain(
    `"url":"https://betabook.test/users/owner?share=${token}"`,
  );
  const visitorView = await profileHeaderFor("member");
  expect(visitorView).toContain("Share Owner");
  expect(visitorView).not.toContain(token);
});

it("shows the owner their link on the account page", async () => {
  const token = await currentToken();

  expect(JSON.stringify(await AccountPage())).toContain(
    `"url":"https://betabook.test/users/owner?share=${token}"`,
  );
});

it("sends no link to a private owner's profile or account page", async () => {
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
  const token = await currentToken();

  const header = await profileHeaderFor("owner");
  const account = JSON.stringify(await AccountPage());
  expect(header).toContain("Share Owner");
  expect(account).toContain('"url":null');
  for (const page of [header, account]) {
    expect(page).not.toContain(token);
    expect(page).not.toContain("?share=");
  }
});
