import { describe, expect, it } from "vitest";

import { breadcrumbExternalId, synthesizeAreaNodes } from "./breadcrumbs.ts";

describe("breadcrumbExternalId", () => {
  it("is deterministic for the same prefix", () => {
    expect(breadcrumbExternalId(["USA", "Colorado"])).toBe(
      breadcrumbExternalId(["USA", "Colorado"]),
    );
  });

  it("differs for different prefixes, including different depths of the same path", () => {
    const usa = breadcrumbExternalId(["USA"]);
    const usaColorado = breadcrumbExternalId(["USA", "Colorado"]);
    expect(usa).not.toBe(usaColorado);
  });
});

describe("synthesizeAreaNodes", () => {
  it("produces one node per breadcrumb level", () => {
    const nodes = synthesizeAreaNodes([["USA", "Colorado", "Boulder Canyon"]]);
    expect(nodes.map((n) => n.areaName)).toEqual(["USA", "Colorado", "Boulder Canyon"]);
  });

  it("sets parentUuid to the shallower prefix's external id, and null at the root", () => {
    const nodes = synthesizeAreaNodes([["USA", "Colorado"]]);
    const [usa, colorado] = nodes;
    expect(usa.parentUuid).toBeNull();
    expect(colorado.parentUuid).toBe(usa.uuid);
  });

  it("sets pathTokens to the root-first ancestor names, excluding the node itself", () => {
    const nodes = synthesizeAreaNodes([["USA", "Colorado", "Boulder Canyon"]]);
    const boulderCanyon = nodes.find((n) => n.areaName === "Boulder Canyon");
    expect(boulderCanyon?.pathTokens).toEqual(["USA", "Colorado"]);
  });

  it("deduplicates a shared prefix across multiple breadcrumbs into one node", () => {
    const nodes = synthesizeAreaNodes([
      ["USA", "Colorado", "Boulder Canyon"],
      ["USA", "Colorado", "Eldorado Canyon"],
    ]);
    const usaNodes = nodes.filter((n) => n.areaName === "USA");
    const coloradoNodes = nodes.filter((n) => n.areaName === "Colorado");
    expect(usaNodes).toHaveLength(1);
    expect(coloradoNodes).toHaveLength(1);
    expect(nodes.map((n) => n.areaName)).toEqual(
      expect.arrayContaining(["USA", "Colorado", "Boulder Canyon", "Eldorado Canyon"]),
    );
    expect(nodes).toHaveLength(4);
  });

  it("orders nodes shallowest-first", () => {
    const nodes = synthesizeAreaNodes([["USA", "Colorado", "Boulder Canyon"]]);
    expect(nodes.map((n) => n.pathTokens.length)).toEqual([0, 1, 2]);
  });

  it("returns nothing for an empty breadcrumb", () => {
    expect(synthesizeAreaNodes([[]])).toEqual([]);
  });
});
