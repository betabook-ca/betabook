import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import type { ComponentProps, ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";

import AccountPage from "@/app/account/page";
import { ProfileHeader } from "@/app/users/[id]/profile-shell";
import { AccountSettings } from "@/components/account-settings";
import { FriendshipButton } from "@/components/friendship-button";
import { WorkspaceShell } from "@/components/workspace-shell";
import { createDb } from "@/db/client";
import { getProfileShareToken } from "@/db/queries";
import { user } from "@/db/schema";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

const session = vi.hoisted(() => ({ userId: "owner" }));

vi.mock("@opennextjs/cloudflare", async () => {
  const { env } = await import("cloudflare:test");
  return {
    getCloudflareContext: async () => ({
      env: { ...env, BETTER_AUTH_URL: "https://betabook.test" },
    }),
  };
});
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
  return JSON.stringify(await ProfileHeader({ user: owner, viewerId, children: null }));
}

async function profileHeadingFor(viewerId: string) {
  const owner = (await db.select().from(user).where(eq(user.id, "owner")).get())!;
  const header = (await ProfileHeader({ user: owner, viewerId, children: null })) as ReactElement<{
    heading: ReactElement<Record<string, unknown>>;
  }>;
  return header.props.heading;
}

/** Renders AccountSettings one level so the assertions reach ShareProfileControls. */
async function accountPageJson() {
  const page = (await AccountPage()) as ReactElement<ComponentProps<typeof AccountSettings>>;
  expect(page.type).toBe(AccountSettings);
  return JSON.stringify(AccountSettings(page.props));
}

it("keeps share credentials out of the workspace and visitor profile", async () => {
  const token = await currentToken();

  expect(await profileHeaderFor("owner")).not.toContain(token);
  const visitorView = await profileHeaderFor("member");
  expect(visitorView).toContain("Share Owner");
  expect(visitorView).not.toContain(token);
});

it.each(["logbook", "progress"] as const)(
  "renders the owner's %s workspace without a profile header",
  async (workspace) => {
    const owner = (await db.select().from(user).where(eq(user.id, "owner")).get())!;
    const page = (await ProfileHeader({
      user: owner,
      viewerId: "owner",
      workspace,
      children: "Workspace content",
    })) as ReactElement<ComponentProps<typeof WorkspaceShell>>;
    expect(page.type).toBe(WorkspaceShell);
    expect(page.props.area).toBe(workspace);
    expect(page.props.userId).toBe("owner");
    expect(page.props.children).toBe("Workspace content");
  },
);

it("puts the friendship control beside another member's name", async () => {
  const heading = await profileHeadingFor("member");

  expect((heading.props.nameAction as ReactElement).type).toBe(FriendshipButton);
  expect(heading.props.tools).toBeFalsy();
});

it("shows the owner their link on the account page", async () => {
  const token = await currentToken();

  expect(await accountPageJson()).toContain(
    `"url":"https://betabook.test/users/owner?share=${token}"`,
  );
});

it("sends no link to a private owner's profile or account page", async () => {
  await db.update(user).set({ isPrivate: true }).where(eq(user.id, "owner"));
  const token = await currentToken();

  const header = await profileHeaderFor("owner");
  const account = await accountPageJson();
  expect(header).toContain('"userId":"owner"');
  expect(account).toContain('"url":null');
  for (const page of [header, account]) {
    expect(page).not.toContain(token);
    expect(page).not.toContain("?share=");
  }
});
