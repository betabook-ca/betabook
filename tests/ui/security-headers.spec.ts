import { appBaseURL } from "@/tests/ui/app-server";

import { test, expect } from "./story";

const securityHeaders = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
};

test(
  "responses carry the security headers without disclosing the framework",
  { tag: ["@behavior", "@app"] },
  async ({ request }) => {
    for (const path of ["/", "/api/public/search/climbs?name=Test", "/sitemap-index.xml"]) {
      const headers = (await request.get(`${appBaseURL}${path}`)).headers();
      for (const [key, value] of Object.entries(securityHeaders))
        expect(headers[key], `${path} ${key}`).toBe(value);
      expect(headers["permissions-policy"], path).toBe(
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      );
      expect(headers["x-powered-by"], path).toBeUndefined();
    }
  },
);
