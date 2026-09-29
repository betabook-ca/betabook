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
      highlights: [],
      action: "Show me how",
    });
  });
  it("introduces journaling to an existing account without tour progress", () => {
    expect(
      getProductTourInvitationCopy(tour, steps, {
        mode: "full",
        returning: true,
      }),
    ).toEqual({
      eyebrow: "What's new",
      title: tour.returningTitle,
      description: tour.returningDescription,
      highlights: [],
      action: "Show me how",
    });
  });
  it("lists what changed in only the selected update lessons regardless of the account's age", () => {
    const updated = steps.filter((step) => step.whatsNew !== undefined).slice(0, 2);
    for (const returning of [true, false]) {
      expect(
        getProductTourInvitationCopy(tour, updated, {
          mode: "updates",
          returning,
        }),
      ).toEqual({
        eyebrow: "What's new",
        title: "New since your last tour",
        description: "Short lessons in the demo account show you how.",
        highlights: [updated[0].whatsNew, updated[1].whatsNew],
        action: "See what's new",
      });
    }
  });
});
