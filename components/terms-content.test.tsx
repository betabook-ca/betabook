import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

import { TermsContent } from "./terms-content";

vi.mock("@/lib/terms", async (original) => ({
  ...(await original<typeof import("@/lib/terms")>()),
  // Simulate a later release while opening the previously published document.
  TERMS_VERSION: "2030-01-01",
  TERMS_UPDATED_LABEL: "January 1, 2030",
}));

it("keeps an archived document's date and text independent of the current release", () => {
  const html = renderToStaticMarkup(<TermsContent version="2026-09-09" />);
  expect(html).toContain('dateTime="2026-09-09"');
  expect(html).toContain("September 9, 2026");
  expect(html).toContain("You retain ownership of content you contribute.");
  expect(html).not.toContain("2030");
});
