import { describe, expect, it } from "vitest";

import {
  chunkStatements,
  renderAreaDecisions,
  renderAreaMerges,
  renderClimbDecisions,
  type ResolvedAreaDecision,
  type ResolvedClimbDecision,
} from "./apply.ts";

describe("renderAreaDecisions", () => {
  it("renders a matched area as a crosswalk insert plus an audit row, no areas write", () => {
    const decisions: ResolvedAreaDecision[] = [
      {
        kind: "match",
        externalId: "ob-area-1",
        betabookId: 42,
        method: "exact",
        confidence: null,
        candidateIds: [42],
        reasoning: null,
      },
    ];
    const sql = renderAreaDecisions("run-1", decisions);
    expect(sql).not.toContain("INSERT INTO areas");
    expect(sql).toContain("INSERT OR IGNORE INTO catalog_external_refs");
    expect(sql).toContain("'openbeta', 'ob-area-1', 'area', 42, 'exact', NULL");
    expect(sql).toContain("INSERT INTO catalog_import_decisions");
    expect(sql).toContain("'matched'");
  });

  it("renders a root-level create with a NULL parent and writes its own crosswalk row via last_insert_rowid()", () => {
    const decisions: ResolvedAreaDecision[] = [
      {
        kind: "create",
        externalId: "ob-area-2",
        name: "New Country",
        parentExternalId: null,
        latitude: 10.5,
        longitude: -20.25,
      },
    ];
    const sql = renderAreaDecisions("run-1", decisions);
    expect(sql).toContain("INSERT INTO areas (parent_id, name, latitude, longitude)");
    expect(sql).toContain("VALUES (NULL, 'New Country', 10.5, -20.25);");
    expect(sql).toContain("'openbeta', 'ob-area-2', 'area', last_insert_rowid(), 'created', NULL");
  });

  it("resolves a nested create's parent via a crosswalk subquery, not a literal id", () => {
    const decisions: ResolvedAreaDecision[] = [
      {
        kind: "create",
        externalId: "ob-area-3",
        name: "Nested Crag",
        parentExternalId: "ob-area-2",
        latitude: null,
        longitude: null,
      },
    ];
    const sql = renderAreaDecisions("run-1", decisions);
    expect(sql).toContain(
      "VALUES ((SELECT betabook_id FROM catalog_external_refs WHERE source = 'openbeta' AND entity_type = 'area' AND external_id = 'ob-area-2'), 'Nested Crag', NULL, NULL);",
    );
  });

  it("renders a skip as an audit-only row with no crosswalk write", () => {
    const decisions: ResolvedAreaDecision[] = [
      {
        kind: "skip",
        externalId: "ob-area-4",
        reason: "ambiguous, unresolved",
        candidateIds: [1, 2],
      },
    ];
    const sql = renderAreaDecisions("run-1", decisions);
    expect(sql).not.toContain("catalog_external_refs");
    expect(sql).toContain("'skipped'");
    expect(sql).toContain("ambiguous, unresolved");
  });

  it("escapes single quotes and strips embedded newlines from string values", () => {
    const decisions: ResolvedAreaDecision[] = [
      {
        kind: "create",
        externalId: "ob-area-5",
        name: "Climber's Crag\nwith a line break",
        parentExternalId: null,
        latitude: null,
        longitude: null,
      },
    ];
    const sql = renderAreaDecisions("run-1", decisions);
    expect(sql).toContain("'Climber''s Crag with a line break'");
    // Every rendered line is a complete statement -- no bare, un-terminated line.
    for (const line of sql.split("\n")) {
      expect(line.trim().endsWith(";")).toBe(true);
    }
  });
});

describe("renderClimbDecisions", () => {
  it("renders a created climb with its area resolved via the crosswalk subquery", () => {
    const decisions: ResolvedClimbDecision[] = [
      {
        kind: "create",
        externalId: "ob-climb-1",
        name: "Superfly",
        type: "boulder",
        grade: 5,
        parentAreaExternalId: "ob-area-1",
        latitude: null,
        longitude: null,
      },
    ];
    const sql = renderClimbDecisions("run-1", decisions);
    expect(sql).toContain("INSERT INTO climbs (area_id, name, type, grade, latitude, longitude)");
    expect(sql).toContain("entity_type = 'area' AND external_id = 'ob-area-1'");
    expect(sql).toContain("'Superfly', 'boulder', 5, NULL, NULL");
  });

  it("renders a matched climb as a crosswalk insert with confidence and method", () => {
    const decisions: ResolvedClimbDecision[] = [
      {
        kind: "match",
        externalId: "ob-climb-2",
        betabookId: 99,
        method: "llm",
        confidence: 0.9,
        candidateIds: [99, 100],
        reasoning: "Same name and grade at the same crag.",
      },
    ];
    const sql = renderClimbDecisions("run-1", decisions);
    expect(sql).toContain("'openbeta', 'ob-climb-2', 'climb', 99, 'llm', 0.9");
    expect(sql).toContain("Same name and grade at the same crag.");
  });
});

describe("renderAreaMerges", () => {
  it("reparents child areas and climbs onto the target, then deletes the source", () => {
    const sql = renderAreaMerges([{ sourceBetabookId: 10, targetBetabookId: 20 }]);
    expect(sql).toBe(
      [
        "UPDATE areas SET parent_id = 20 WHERE parent_id = 10;",
        "UPDATE climbs SET area_id = 20 WHERE area_id = 10;",
        "DELETE FROM areas WHERE id = 10;",
      ].join("\n"),
    );
  });
});

describe("chunkStatements", () => {
  it("splits statements into chunks no larger than the given size", () => {
    const sql = ["a;", "b;", "c;", "d;", "e;"].join("\n");
    const chunks = chunkStatements(sql, 2);
    expect(chunks).toEqual(["a;\nb;", "c;\nd;", "e;"]);
  });

  it("returns a single chunk when everything fits", () => {
    const sql = ["a;", "b;"].join("\n");
    expect(chunkStatements(sql, 10)).toEqual(["a;\nb;"]);
  });

  it("drops blank lines rather than counting them as statements", () => {
    const sql = ["a;", "", "b;"].join("\n");
    expect(chunkStatements(sql, 10)).toEqual(["a;\nb;"]);
  });
});
