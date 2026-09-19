import { describe, expect, it } from "vitest";

import {
  chunkStatements,
  renderAreaDecisions,
  renderAreaMerges,
  renderClimbDecisions,
  type ResolvedAreaDecision,
  type ResolvedClimbDecision,
} from "./apply.ts";

/** Most assertions below don't care about group boundaries -- flatten to a
 * single string, same shape the old flat-returning render functions had. */
function flatten(groups: readonly (readonly string[])[]): string {
  return groups.flat().join("\n");
}

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
    const groups = renderAreaDecisions("run-1", decisions);
    expect(groups).toHaveLength(1);
    const sql = flatten(groups);
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
    const groups = renderAreaDecisions("run-1", decisions);
    expect(groups).toHaveLength(1);
    // Entity insert, crosswalk insert, audit insert -- kept together as one
    // group so chunkStatements never splits them across separate files.
    expect(groups[0]).toHaveLength(3);
    const sql = flatten(groups);
    expect(sql).toContain("INSERT INTO areas (parent_id, name, latitude, longitude)");
    expect(sql).toContain("VALUES (NULL, 'New Country', 10.5, -20.25);");
    expect(sql).toContain("'openbeta', 'ob-area-2', 'area', last_insert_rowid(), 'created', NULL");
  });

  it("resolves the audit row's betabook_id via a crosswalk subquery, not a second last_insert_rowid() call", () => {
    // SQLite's last_insert_rowid() reflects only the single most recent
    // insert on the connection -- calling it again for the audit row (after
    // the crosswalk insert, a different table) would return the crosswalk
    // row's own id, not the area's. Confirmed here: last_insert_rowid()
    // appears exactly once per create group (the crosswalk insert).
    const decisions: ResolvedAreaDecision[] = [
      {
        kind: "create",
        externalId: "ob-area-2",
        name: "New Country",
        parentExternalId: null,
        latitude: null,
        longitude: null,
      },
    ];
    const [group] = renderAreaDecisions("run-1", decisions);
    const auditRow = group[2];
    expect(auditRow).toContain("INSERT INTO catalog_import_decisions");
    expect(auditRow).toContain(
      "(SELECT betabook_id FROM catalog_external_refs WHERE source = 'openbeta' AND entity_type = 'area' AND external_id = 'ob-area-2')",
    );
    expect(group.join("\n").match(/last_insert_rowid\(\)/g)).toHaveLength(1);
  });

  it("carries arbitration confidence and reasoning into both the crosswalk and audit rows for a create", () => {
    const decisions: ResolvedAreaDecision[] = [
      {
        kind: "create",
        externalId: "ob-area-arb",
        name: "Ambiguous New Area",
        parentExternalId: null,
        latitude: null,
        longitude: null,
        arbitration: {
          confidence: 0.9,
          reasoning: "Candidates are a different real-world area; safe to create.",
          candidateIds: [10, 11],
        },
      },
    ];
    const sql = flatten(renderAreaDecisions("run-1", decisions));
    expect(sql).toContain(
      "'openbeta', 'ob-area-arb', 'area', last_insert_rowid(), 'created', 0.9);",
    );
    expect(sql).toContain("Candidates are a different real-world area; safe to create.");
    expect(sql).toContain("'[10,11]'");
  });

  it("leaves confidence/reasoning null and candidates empty for a plain create with no arbitration", () => {
    const decisions: ResolvedAreaDecision[] = [
      {
        kind: "create",
        externalId: "ob-area-plain",
        name: "Plain New Area",
        parentExternalId: null,
        latitude: null,
        longitude: null,
      },
    ];
    const sql = flatten(renderAreaDecisions("run-1", decisions));
    expect(sql).toContain(
      "'openbeta', 'ob-area-plain', 'area', last_insert_rowid(), 'created', NULL);",
    );
    expect(sql).toContain("'[]'");
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
    const sql = flatten(renderAreaDecisions("run-1", decisions));
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
    const groups = renderAreaDecisions("run-1", decisions);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(1);
    const sql = flatten(groups);
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
    const sql = flatten(renderAreaDecisions("run-1", decisions));
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
    const groups = renderClimbDecisions("run-1", decisions);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
    const sql = flatten(groups);
    expect(sql).toContain("INSERT INTO climbs (area_id, name, type, grade, latitude, longitude)");
    expect(sql).toContain("entity_type = 'area' AND external_id = 'ob-area-1'");
    expect(sql).toContain("'Superfly', 'boulder', 5, NULL, NULL");
  });

  it("resolves the audit row's betabook_id via a crosswalk subquery for a created climb too", () => {
    const decisions: ResolvedClimbDecision[] = [
      {
        kind: "create",
        externalId: "ob-climb-1",
        name: "Superfly",
        type: "boulder",
        grade: null,
        parentAreaExternalId: "ob-area-1",
        latitude: null,
        longitude: null,
      },
    ];
    const [group] = renderClimbDecisions("run-1", decisions);
    expect(group[2]).toContain(
      "(SELECT betabook_id FROM catalog_external_refs WHERE source = 'openbeta' AND entity_type = 'climb' AND external_id = 'ob-climb-1')",
    );
    expect(group.join("\n").match(/last_insert_rowid\(\)/g)).toHaveLength(1);
  });

  it("carries arbitration reasoning into the audit row for a create that followed real candidates", () => {
    const decisions: ResolvedClimbDecision[] = [
      {
        kind: "create",
        externalId: "ob-climb-arb",
        name: "Kandahar",
        type: "trad",
        grade: null,
        parentAreaExternalId: "ob-area-1",
        latitude: null,
        longitude: null,
        arbitration: {
          confidence: 0.9,
          reasoning: "Candidates are individual pitches of the whole route.",
          candidateIds: [4466, 7019],
        },
      },
    ];
    const sql = flatten(renderClimbDecisions("run-1", decisions));
    expect(sql).toContain(
      "'openbeta', 'ob-climb-arb', 'climb', last_insert_rowid(), 'created', 0.9);",
    );
    expect(sql).toContain("Candidates are individual pitches of the whole route.");
    expect(sql).toContain("'[4466,7019]'");
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
    const sql = flatten(renderClimbDecisions("run-1", decisions));
    expect(sql).toContain("'openbeta', 'ob-climb-2', 'climb', 99, 'llm', 0.9");
    expect(sql).toContain("Same name and grade at the same crag.");
  });
});

describe("renderAreaMerges", () => {
  it("retargets the source's crosswalk rows, reparents child areas and climbs onto the target, then deletes the source", () => {
    const groups = renderAreaMerges([{ sourceBetabookId: 10, targetBetabookId: 20 }]);
    expect(groups).toEqual([
      [
        "UPDATE catalog_external_refs SET betabook_id = 20 WHERE entity_type = 'area' AND betabook_id = 10;",
        "UPDATE areas SET parent_id = 20 WHERE parent_id = 10;",
        "UPDATE climbs SET area_id = 20 WHERE area_id = 10;",
        "DELETE FROM areas WHERE id = 10;",
      ],
    ]);
  });
});

describe("chunkStatements", () => {
  it("splits groups into chunks no larger than the given statement count", () => {
    const groups = [["a;"], ["b;"], ["c;"], ["d;"], ["e;"]];
    const chunks = chunkStatements(groups, 2);
    expect(chunks).toEqual(["a;\nb;", "c;\nd;", "e;"]);
  });

  it("returns a single chunk when everything fits", () => {
    const groups = [["a;"], ["b;"]];
    expect(chunkStatements(groups, 10)).toEqual(["a;\nb;"]);
  });

  it("never splits one group across two chunks, even if that overshoots maxStatements", () => {
    // A 3-statement create group with maxStatements=2: splitting would break
    // the group's own last_insert_rowid() dependency across separate
    // wrangler executions, so the whole group goes in one chunk instead.
    const groups = [["a;", "b;", "c;"], ["d;"]];
    expect(chunkStatements(groups, 2)).toEqual(["a;\nb;\nc;", "d;"]);
  });

  it("keeps a group's statements adjacent and in order within its chunk", () => {
    const groups = [
      ["insert-1;", "crosswalk-1;", "audit-1;"],
      ["insert-2;", "crosswalk-2;", "audit-2;"],
    ];
    expect(chunkStatements(groups, 3)).toEqual([
      "insert-1;\ncrosswalk-1;\naudit-1;",
      "insert-2;\ncrosswalk-2;\naudit-2;",
    ]);
  });
});
