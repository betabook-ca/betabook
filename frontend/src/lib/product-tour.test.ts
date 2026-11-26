import { describe, expect, it } from "vitest";

import { PRODUCT_TOURS, validateProductTourUpdate } from "@/lib/product-tour";

const tour = PRODUCT_TOURS[0];

describe("product tour progress validation", () => {
  it("rejects unknown tours and stale client versions", () => {
    expect(() => validateProductTourUpdate("unknown", 1, "completed")).toThrow("tour has changed");
    expect(() => validateProductTourUpdate(tour.id, 0, "completed")).toThrow("tour has changed");
    expect(() => validateProductTourUpdate(tour.id, tour.version, "pending")).toThrow(
      "Invalid product tour status",
    );
  });
});
