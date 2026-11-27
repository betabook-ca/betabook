import { describe, expect, it } from "vitest";

import { toBreadcrumbPath } from "./search-suggestions";

describe("toBreadcrumbPath", () => {
  // searchAreas emits ancestorPath root-first (pinned by the ordered subquery
  // its GROUP_CONCAT reads from — see db/queries/areas.ts), so this only
  // restyles the separator to match every rendered breadcrumb.
  it("keeps the root-first order and swaps the separator", () => {
    expect(toBreadcrumbPath("Canada > British Columbia > Squamish")).toBe(
      "Canada / British Columbia / Squamish",
    );
  });

  it("passes a single ancestor through with the separator swapped", () => {
    expect(toBreadcrumbPath("Canada")).toBe("Canada");
  });

  it("returns null for a root area, which has no ancestors to place it under", () => {
    expect(toBreadcrumbPath(null)).toBeNull();
  });

  it("returns null for an empty path rather than an empty breadcrumb", () => {
    expect(toBreadcrumbPath("")).toBeNull();
  });

  // Area names are user-supplied, and nothing stops one containing the
  // separator — splitting on the exact " > " the query joins with keeps a
  // name like "Squamish > The Chief" from being torn into two segments.
  it("keeps a name containing a bare angle bracket intact", () => {
    expect(toBreadcrumbPath("Canada > A>B")).toBe("Canada / A>B");
  });
});
