import { describe, expect, it } from "vitest";

import { clipTourTarget, tourTargetScrollDelta } from "@/lib/product-tour-position";

const viewport = { left: 16, top: 140, width: 358, height: 380 };

describe("tour highlight clipping", () => {
  it("never draws over the guide when a target extends below the demo", () => {
    const clipped = clipTourTarget({ left: 24, top: 480, width: 340, height: 200 }, viewport);
    expect(clipped).toEqual({ left: 18, top: 474, width: 352, height: 46 });
  });

  it("clips targets on every edge of the demo viewport", () => {
    expect(clipTourTarget({ left: 0, top: 100, width: 500, height: 600 }, viewport)).toEqual(
      viewport,
    );
  });

  it("hides the outline when its target scrolls out of view", () => {
    expect(clipTourTarget({ left: 24, top: 600, width: 340, height: 40 }, viewport)).toBeNull();
    expect(clipTourTarget({ left: 24, top: 50, width: 340, height: 40 }, viewport)).toBeNull();
  });
});

describe("tour scrolling within the demo", () => {
  it("leaves space for results below a newly introduced control", () => {
    const target = { left: 24, top: 480, width: 340, height: 80 };
    const delta = tourTargetScrollDelta(target, viewport, true);
    expect(target.top - delta).toBe(244);
    expect(viewport.top + viewport.height - (target.top - delta + target.height)).toBe(196);
  });
  it("leaves an already visible target and its context in place", () => {
    expect(tourTargetScrollDelta({ left: 24, top: 170, width: 340, height: 40 }, viewport)).toBe(0);
  });

  it("reveals an expanded control with the smallest necessary scroll", () => {
    const target = { left: 24, top: 400, width: 340, height: 180 };
    const delta = tourTargetScrollDelta(target, viewport);
    expect(delta).toBe(72);
    expect(target.top + target.height - delta).toBe(508);
  });

  it("reveals a target above the visible area", () => {
    expect(tourTargetScrollDelta({ left: 24, top: 100, width: 340, height: 40 }, viewport)).toBe(
      -52,
    );
  });

  it("starts at the top of a target taller than the available space", () => {
    const target = { left: 24, top: 400, width: 340, height: 600 };
    expect(target.top - tourTargetScrollDelta(target, viewport)).toBe(152);
  });
});
