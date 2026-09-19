import { expect, openStory, test } from "./story";

/** Where an avatar sits relative to the name it labels, and where a comment
 * starts relative to that avatar. Both are real geometry: the avatar has to
 * centre on the name and its date rather than on the whole row, and a
 * comment has to begin at the row's own left edge rather than indent past
 * the avatar. jsdom cannot measure either. */

const centreY = (box: { y: number; height: number }) => box.y + box.height / 2;

test("a send row centres its avatar on the name and date, with the comment starting under it @layout", async ({
  page,
}, info) => {
  await openStory(page, info, "components-climbs-public-sends--mixed-audiences");

  const name = page.getByText("Priya Nair", { exact: true });
  const date = page.getByText("Sep 6, 2026", { exact: true });
  // The avatar is decorative, so its initials are the only handle on it.
  const avatar = page.getByText("PN", { exact: true });
  const comment = page.getByText(/^The left-hand crimp/);

  const [nameBox, dateBox, avatarBox, commentBox] = await Promise.all([
    name.boundingBox(),
    date.boundingBox(),
    avatar.boundingBox(),
    comment.boundingBox(),
  ]);
  if (!nameBox || !dateBox || !avatarBox || !commentBox) throw new Error("Missing send row bounds");

  // Centred on the pair, not on the row: with the comment included the
  // avatar would sit roughly a comment's height lower.
  const pairCentre = (nameBox.y + dateBox.y + dateBox.height) / 2;
  expect(Math.abs(centreY(avatarBox) - pairCentre)).toBeLessThanOrEqual(2);

  // The comment reads from the row's edge, left of the name and of the avatar.
  expect(commentBox.x).toBeLessThan(nameBox.x);
  expect(commentBox.x).toBeLessThanOrEqual(avatarBox.x);
});

test("an anonymous send row keeps the same left edge as a named one @layout", async ({
  page,
}, info) => {
  await openStory(page, info, "components-climbs-public-sends--mixed-audiences");

  const named = await page.getByText("Priya Nair", { exact: true }).boundingBox();
  const anonymous = await page.getByText("Betabook climber", { exact: true }).first().boundingBox();
  if (!named || !anonymous) throw new Error("Missing send row bounds");

  // The neutral mark holds the slot an avatar would take, so a mixed list
  // does not step in and out.
  expect(Math.abs(anonymous.x - named.x)).toBeLessThanOrEqual(1);
});

test("a feed note starts under the avatar and activity label @layout", async ({ page }, info) => {
  await openStory(page, info, "components-journal-feed-timeline--activity-feed");

  const card = page.getByRole("article", { name: "Cedar Arete" }).first();
  const note = card.getByText(/^Painfully close!/).first();
  const author = card.getByRole("link", { name: "Alex Rivera", exact: true }).first();
  const avatar = card.getByText("AR", { exact: true }).first();
  const activity = card.getByText("Session", { exact: true }).first();

  const [noteBox, authorBox, avatarBox, activityBox] = await Promise.all([
    note.boundingBox(),
    author.boundingBox(),
    avatar.boundingBox(),
    activity.boundingBox(),
  ]);
  if (!noteBox || !authorBox || !avatarBox || !activityBox)
    throw new Error("Missing feed row bounds");

  expect(Math.abs(noteBox.x - avatarBox.x)).toBeLessThanOrEqual(1);
  if (info.project.name.startsWith("mobile"))
    expect(Math.abs(noteBox.x - activityBox.x)).toBeLessThanOrEqual(1);
  expect(noteBox.x).toBeLessThan(authorBox.x);
});
