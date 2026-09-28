import { describe, expect, it } from "vitest";

import { SECURITY_HEADERS, withSecurityHeaders } from "./security-headers";

describe("withSecurityHeaders", () => {
  it("adds every header to a redirect built without them, keeping its status and target", () => {
    const response = withSecurityHeaders(Response.redirect("https://betabook.ca/search", 308));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://betabook.ca/search");
    for (const { key, value } of SECURITY_HEADERS) expect(response.headers.get(key)).toBe(value);
  });

  it("keeps a value the response already set and fills in the rest", async () => {
    const response = withSecurityHeaders(
      new Response("not found", { status: 404, headers: { "X-Frame-Options": "SAMEORIGIN" } }),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("not found");
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
  });

  it("returns a response that already carries them unchanged", () => {
    const headers = new Headers(SECURITY_HEADERS.map(({ key, value }) => [key, value]));
    const response = new Response(null, { headers });
    expect(withSecurityHeaders(response)).toBe(response);
  });
});
