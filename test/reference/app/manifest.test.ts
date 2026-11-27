import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("install branding", () => {
  it("offers real-sized PNG icons instead of a favicon as an app tile", () => {
    expect(manifest().icons).toEqual([
      { src: "/branding/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/branding/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ]);
  });
});
