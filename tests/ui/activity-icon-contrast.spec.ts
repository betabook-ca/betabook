import { expect, openStory, test } from "./story";

type Swatch = [number, number, number, number];

async function iconAndBackdrop(page: Parameters<typeof openStory>[0], icon: string) {
  return page
    .locator(`svg.lucide-${icon}`)
    .first()
    .evaluate((svg) => {
      const circle = svg.parentElement;
      if (!circle) throw new Error("Missing activity icon circle");
      const card = circle.closest("article");
      const backdrop = card ?? document.body;
      const backdropColor = getComputedStyle(backdrop).backgroundColor;
      const pixel = (color: string): Swatch => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Missing canvas context");
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data] as Swatch;
      };
      return {
        circle: pixel(getComputedStyle(circle).backgroundColor),
        backdrop: pixel(
          backdropColor === "rgba(0, 0, 0, 0)"
            ? getComputedStyle(document.documentElement).getPropertyValue("--background").trim()
            : backdropColor,
        ),
      };
    });
}

function colorDistance(a: Swatch, b: Swatch) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

test("activity circles match Community avatar size and share visible colors across Feed and Journal", async ({
  page,
}, info) => {
  await openStory(page, info, "components-journal-feed-activity-card--session");
  const feed = await iconAndBackdrop(page, "circle-dashed");
  const iconBox = await page
    .locator("svg.lucide-circle-dashed")
    .first()
    .locator("..")
    .boundingBox();
  const avatarBox = await page.getByText("AR", { exact: true }).boundingBox();
  if (!iconBox || !avatarBox) throw new Error("Missing feed icon or profile circle bounds");
  expect(iconBox.width).toBe(avatarBox.width);
  expect(iconBox.height).toBe(avatarBox.height);
  expect(
    Math.abs(iconBox.y + iconBox.height / 2 - avatarBox.y - avatarBox.height / 2),
  ).toBeLessThanOrEqual(1);
  await openStory(page, info, "components-journal-entry-row--session");
  const journal = await iconAndBackdrop(page, "circle-dashed");

  expect(feed.circle).toEqual(journal.circle);
  expect(journal.circle[3]).toBe(255);
  expect(colorDistance(journal.circle, journal.backdrop)).toBeGreaterThan(40);
  expect(colorDistance(feed.circle, feed.backdrop)).toBeGreaterThan(40);

  await openStory(page, info, "components-journal-feed-activity-card--single-send");
  const feedSend = await iconAndBackdrop(page, "circle-check-big");
  await openStory(page, info, "components-journal-entry-row--sent");
  const journalSend = await iconAndBackdrop(page, "circle-check-big");
  expect(feedSend.circle).toEqual(journalSend.circle);
  expect(journalSend.circle[3]).toBe(255);
});
