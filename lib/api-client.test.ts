import { afterEach, expect, it, vi } from "vitest";

import { TermsAcceptanceRequiredError } from "./action-result";
import { apiFetch, AuthenticationRequiredError } from "./api-client";

afterEach(() => vi.unstubAllGlobals());
it("reports outdated agreement separately from sign-in and other permission failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ code: "TERMS_ACCEPTANCE_REQUIRED" }, { status: 428 })),
  );
  await expect(apiFetch("https://betabook.ca/api/feed")).rejects.toBeInstanceOf(
    TermsAcceptanceRequiredError,
  );
});
it("reports a 401 as authentication required and disables caching", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ error: "Not signed in" }, { status: 401 }));
  vi.stubGlobal("fetch", transport);
  await expect(apiFetch("https://betabook.ca/api/feed")).rejects.toBeInstanceOf(
    AuthenticationRequiredError,
  );
  expect(transport).toHaveBeenCalledWith("https://betabook.ca/api/feed", { cache: "no-store" });
});
it("preserves authenticated permission failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: "Forbidden" }, { status: 403 })),
  );
  expect((await apiFetch("https://betabook.ca/api/users/other/sends/export")).status).toBe(403);
});
