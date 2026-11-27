import { afterEach, describe, expect, it } from "vitest";

import { clearBootstrapData, peekBootstrapData, syncBootstrapPath } from "@/spa/bootstrap";

function injectBootstrapScript(payload: unknown) {
  const script = document.createElement("script");
  script.id = "__BETABOOK_DATA__";
  script.type = "application/json";
  script.textContent = JSON.stringify(payload);
  document.body.appendChild(script);
}

describe("SPA inline bootstrap data", () => {
  afterEach(() => {
    clearBootstrapData();
    document.getElementById("__BETABOOK_DATA__")?.remove();
  });

  it("reads inline JSON idempotently on the active path and clears after navigation", () => {
    injectBootstrapScript({
      route: "climb",
      path: "/climbs/1/electric-fund",
      data: { climbId: 1, name: "Electric Fund" },
    });

    const firstRead = peekBootstrapData("climb", "/climbs/1/electric-fund");
    const strictModeSecondRead = peekBootstrapData("climb", "/climbs/1/electric-fund");

    expect(firstRead).toEqual({ climbId: 1, name: "Electric Fund" });
    expect(strictModeSecondRead).toEqual({ climbId: 1, name: "Electric Fund" });
    expect(document.getElementById("__BETABOOK_DATA__")).toBeNull();

    // Mismatched route never leaks another route's payload.
    expect(peekBootstrapData("area", "/climbs/1/electric-fund")).toBeNull();

    // Navigating away clears cached data so returning later fetches fresh data.
    syncBootstrapPath("/");
    expect(peekBootstrapData("climb", "/climbs/1/electric-fund")).toBeNull();
  });

  it("returns null on malformed JSON without throwing", () => {
    const script = document.createElement("script");
    script.id = "__BETABOOK_DATA__";
    script.type = "application/json";
    script.textContent = "{not valid json";
    document.body.appendChild(script);

    expect(peekBootstrapData("home", "/")).toBeNull();
    expect(document.getElementById("__BETABOOK_DATA__")).toBeNull();
  });
});
