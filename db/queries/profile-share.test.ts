import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";

import { createDb } from "@/db/client";
import { profileShareLinks, user } from "@/db/schema";
import { seedFixtureUser } from "@/test/fixtures";
import { resetDb } from "@/test/reset-db";

import { getProfileShareToken, getShareLinkOwner } from "./profile-share";

const TOKEN_FORMAT = /^[0-9a-f]{32}$/;
const IMAGE = "https://lh3.googleusercontent.com/a/share-owner";
const db = createDb(env.DB);

beforeEach(async () => {
  await resetDb(db);
  await seedFixtureUser(db, { id: "owner", name: "Share Owner", image: IMAGE });
  await seedFixtureUser(db, { id: "other", name: "Other Climber" });
});

function setPrivate(id: string, isPrivate: boolean) {
  return db.update(user).set({ isPrivate }).where(eq(user.id, id));
}

it("issues every account its own link", async () => {
  const owner = await getProfileShareToken(db, "owner");
  const other = await getProfileShareToken(db, "other");
  expect(owner).toMatch(TOKEN_FORMAT);
  expect(other).toMatch(TOKEN_FORMAT);
  expect(owner).not.toBe(other);
});

it("names only the owner of a current link on a profile that isn't private", async () => {
  const token = (await getProfileShareToken(db, "owner"))!;
  expect(await getShareLinkOwner(db, token)).toEqual({
    id: "owner",
    name: "Share Owner",
    image: IMAGE,
  });
  expect(await getShareLinkOwner(db, "0".repeat(32))).toBeNull();

  await setPrivate("owner", true);
  const privateToken = (await getProfileShareToken(db, "owner"))!;
  expect(await getShareLinkOwner(db, privateToken)).toBeNull();
});

it("keeps earlier links dead after a private profile is made public again", async () => {
  const before = (await getProfileShareToken(db, "owner"))!;
  const otherBefore = await getProfileShareToken(db, "other");

  await setPrivate("owner", true);
  await setPrivate("owner", false);

  const after = (await getProfileShareToken(db, "owner"))!;
  expect(after).toMatch(TOKEN_FORMAT);
  expect(after).not.toBe(before);
  expect(await getShareLinkOwner(db, before)).toBeNull();
  expect(await getShareLinkOwner(db, after)).toMatchObject({ id: "owner" });
  expect(await getProfileShareToken(db, "other")).toBe(otherBefore);
});

it("keeps the link through other profile saves", async () => {
  const before = await getProfileShareToken(db, "owner");
  await setPrivate("owner", false);
  await db
    .update(user)
    .set({ name: "Renamed Owner", journalVisibility: "public" })
    .where(eq(user.id, "owner"));
  expect(await getProfileShareToken(db, "owner")).toBe(before);
});

it("removes the link with the account and clears referrals to it", async () => {
  await seedFixtureUser(db, { id: "invited", name: "Invited Climber", referredBy: "owner" });
  await db.delete(user).where(eq(user.id, "owner"));
  expect(
    await db.select().from(profileShareLinks).where(eq(profileShareLinks.userId, "owner")),
  ).toEqual([]);
  expect(
    await db.select({ referredBy: user.referredBy }).from(user).where(eq(user.id, "invited")).get(),
  ).toEqual({ referredBy: null });
});

it("withholds the owner's photo from a share link once they chose initials", async () => {
  const token = (await getProfileShareToken(db, "owner"))!;
  await db.update(user).set({ showProfilePhoto: false }).where(eq(user.id, "owner"));

  // A link holder sees the same avatar a signed-in member does: the name still
  // identifies the owner, only the photo is withheld.
  expect(await getShareLinkOwner(db, token)).toEqual({
    id: "owner",
    name: "Share Owner",
    image: null,
  });

  await db.update(user).set({ showProfilePhoto: true }).where(eq(user.id, "owner"));
  expect((await getShareLinkOwner(db, token))?.image).toBe(IMAGE);
});
