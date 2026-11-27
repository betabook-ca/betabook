import { describe, expect, it } from "vitest";

import { PRODUCT_TOURS } from "@/lib/product-tour";
import { getProductTourInvitationCopy } from "@/lib/product-tour-invitation";
import { PRODUCT_TOUR_STEPS } from "@/lib/product-tour-navigation";

const tour = PRODUCT_TOURS[0];
const steps = PRODUCT_TOUR_STEPS[tour.id];

describe("tour invitation copy", () => {
  it("welcomes a new account", () => {
    expect(getProductTourInvitationCopy(tour, steps, { mode: "full" })).toEqual({
      eyebrow: "Welcome to Betabook",
      title: tour.title,
      description: tour.description,
      action: "Show me how",
    });
  });
  it("introduces journaling to an existing account without tour progress", () => {
    expect(getProductTourInvitationCopy(tour, steps, { mode: "full", returning: true })).toEqual({
      eyebrow: "What's new",
      title: tour.returningTitle,
      description: tour.returningDescription,
      action: "Show me how",
    });
  });
  it("lists only the selected update lessons regardless of the account's age", () => {
    for (const returning of [true, false]) {
      expect(
        getProductTourInvitationCopy(tour, [steps[2]], { mode: "updates", returning }),
      ).toEqual({
        eyebrow: "What's new",
        title: tour.name,
        description: steps[2].title,
        action: "See what's new",
      });
    }
  });
});
