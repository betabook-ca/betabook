import { TERMS_VERSION } from "@/lib/terms";

import { appBaseURL } from "./app-server";
import { expect, test } from "./story";

test.use({ baseURL: appBaseURL });

test(
  "acceptance requires sign-in while published terms remain public",
  { tag: ["@behavior", "@app"] },
  async ({ page }) => {
    await page.goto("/accept-terms?next=%2Ffriends%3Fview%3Drequests");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccept-terms/);
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    await page.goto(`/terms/${TERMS_VERSION}`);
    await expect(
      page.getByRole("heading", { name: "Terms of Service", exact: true }),
    ).toBeVisible();
    // Next can stream a not-found response with HTTP 200. Verify the actual
    // rejection and noindex contract rather than the streaming status code.
    await page.goto("/terms/not-a-published-version");
    await expect(page.getByRole("heading", { name: "Page not found", exact: true })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    await expect(page.getByRole("heading", { name: "Terms of Service", exact: true })).toHaveCount(
      0,
    );
  },
);

test(
  "terms open from signup without losing entries and remain reachable from the footer",
  { tag: "@app" },
  async ({ page, context, request }, testInfo) => {
    // This checks navigation, not Next dev's cold compilation time. Compile the
    // destination before the click, as the app-server readiness does for home.
    await expect(await request.get("/contact")).toBeOK();
    await page.goto("/sign-up?next=%2Faccount");
    const email = page.getByRole("textbox", { name: "Email" });
    await email.fill("climber@example.com");
    const popup = context.waitForEvent("page");
    await page.getByRole("link", { name: /Read the Terms of Service/ }).click();
    const terms = await popup;
    await expect(terms).toHaveURL(`${appBaseURL}/terms/${TERMS_VERSION}`);
    await expect(
      terms.getByRole("heading", { name: "Terms of Service", exact: true }),
    ).toBeVisible();
    await expect(terms.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://betabook.ca/terms/${TERMS_VERSION}`,
    );
    await expect(email).toHaveValue("climber@example.com");
    await expect(
      page.getByRole("checkbox", { name: /I agree to the Terms of Service/ }),
    ).not.toBeChecked();
    await terms.close();
    await testInfo.attach("signup-agreement", {
      body: await page.screenshot({
        fullPage: true,
        animations: "disabled",
        path: testInfo.outputPath("signup-agreement.png"),
      }),
      contentType: "image/png",
    });
    await page.getByRole("contentinfo").getByRole("link", { name: "Terms of Service" }).click();
    await expect(page).toHaveURL("/terms");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await testInfo.attach("terms-page", {
      body: await page.screenshot({
        fullPage: true,
        animations: "disabled",
        path: testInfo.outputPath("terms-page.png"),
      }),
      contentType: "image/png",
    });
    await page.getByRole("article").getByRole("link", { name: "contact form" }).last().click();
    await expect(page).toHaveURL("/contact");
    await expect(page.getByRole("heading", { name: "Contact", exact: true })).toBeVisible();
  },
);
