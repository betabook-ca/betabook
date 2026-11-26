import { expect, it } from "vitest";

import {
  nextQuarterTurn,
  rotatedFrame,
  rotationPlacement,
  sameCropArea,
  squareCropArea,
  type QuarterTurn,
} from "@/lib/photo-crop";

it("cycles the rotate button through quarter turns", () => {
  const turns: QuarterTurn[] = [];
  let rotation: QuarterTurn = 0;
  for (let press = 0; press < 5; press += 1) {
    rotation = nextQuarterTurn(rotation);
    turns.push(rotation);
  }

  expect(turns).toEqual([90, 180, 270, 0, 90]);
});

it("swaps the frame's sides on a quarter turn only", () => {
  const portrait = { width: 300, height: 900 };

  expect(rotatedFrame(portrait, 0)).toEqual({ width: 300, height: 900 });
  expect(rotatedFrame(portrait, 90)).toEqual({ width: 900, height: 300 });
  expect(rotatedFrame(portrait, 180)).toEqual({ width: 300, height: 900 });
  expect(rotatedFrame(portrait, 270)).toEqual({ width: 900, height: 300 });
});

it("places a turned photo centred on the canvas its rotation needs", () => {
  const placement = rotationPlacement({ width: 400, height: 200 }, 90);

  expect(placement.canvas).toEqual({ width: 200, height: 400 });
  expect(placement.centre).toEqual({ x: 100, y: 200 });
  expect(placement.offset).toEqual({ x: -200, y: -100 });
  expect(placement.radians).toBeCloseTo(Math.PI / 2);
});

it("takes the whole photo when the crop covers it", () => {
  expect(
    squareCropArea({ x: 0, y: 0, width: 400, height: 400 }, { width: 400, height: 400 }),
  ).toEqual({ x: 0, y: 0, width: 400, height: 400 });
});

it("squares a crop the cropper reported a fraction off", () => {
  // aspect=1 still yields fractional, unequal sides after rounding.
  const area = squareCropArea(
    { x: 10.4, y: 20.6, width: 199.8, height: 200.2 },
    { width: 600, height: 400 },
  );

  expect(area.width).toBe(area.height);
  expect(area).toEqual({ x: 10, y: 21, width: 200, height: 200 });
});

it("keeps a crop that overruns an edge inside the photo", () => {
  // Left outside, and past the right and bottom edges: a source rectangle
  // reaching past the photo would draw transparent padding into the avatar.
  expect(
    squareCropArea({ x: -30, y: -12, width: 100, height: 100 }, { width: 400, height: 300 }),
  ).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  expect(
    squareCropArea({ x: 380, y: 260, width: 100, height: 100 }, { width: 400, height: 300 }),
  ).toEqual({ x: 300, y: 200, width: 100, height: 100 });
});

it("never asks for more than the shorter side of the photo", () => {
  const area = squareCropArea({ x: 0, y: 0, width: 900, height: 900 }, { width: 900, height: 300 });

  expect(area).toEqual({ x: 0, y: 0, width: 300, height: 300 });
});

it("recognizes a repeated report of the same region", () => {
  // The cropper hands back a fresh object each time it reports; storing one
  // that changed nothing would re-render the drawer on every report.
  const area = { x: 4, y: 8, width: 100, height: 100 };

  expect(sameCropArea(area, { ...area })).toBe(true);
  expect(sameCropArea(area, { ...area, x: 5 })).toBe(false);
  expect(sameCropArea(area, { ...area, width: 101 })).toBe(false);
});

it("never reports an empty crop", () => {
  const area = squareCropArea({ x: 5, y: 5, width: 0, height: 0 }, { width: 400, height: 400 });

  expect(area.width).toBe(1);
  expect(area.height).toBe(1);
});
