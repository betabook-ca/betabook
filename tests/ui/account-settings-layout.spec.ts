import { expect, openStory, test } from "./story";

test("You starts with the account identity without a separate title row", async ({
  page,
}, info) => {
  await openStory(page, info, "components-account-settings-page--member");
  const heading = page.getByRole("heading", { level: 1, name: "You", exact: true });
  const headingBox = await heading.boundingBox();
  const container = await heading.locator("..").boundingBox();
  const identity = await page
    .getByText("Alex Rivera", { exact: true })
    .locator("xpath=ancestor::header")
    .boundingBox();
  if (!headingBox || !container || !identity) throw new Error("Missing account layout");
  expect(headingBox.width).toBeLessThanOrEqual(1);
  expect(headingBox.height).toBeLessThanOrEqual(1);
  expect(identity.y).toBe(container.y);
  expect(identity.height).toBe(48);
  await info.attach("account-layout", {
    body: await page.screenshot({ path: info.outputPath("account-layout.png") }),
    contentType: "image/png",
  });
});
