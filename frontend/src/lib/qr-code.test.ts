import jsQR from "jsqr";
import { expect, it } from "vitest";

import { qrMatrix, qrPixels } from "./qr-code";

const SHARE_URL =
  "https://betabook.ca/users/Qm7c2VdN4pX8rT1yK6hB9wLs3JfZ0aEu?share=4f9c2a7e1b8d6035c9e4a1f7b2d80e36";

it("renders pixels a scanner decodes back to the share link", () => {
  const matrix = qrMatrix(SHARE_URL);
  const { data, width } = qrPixels(matrix, 4);
  expect(width).toBe(matrix.length * 4);
  expect(jsQR(data, width, width)?.data).toBe(SHARE_URL);
});

it("surrounds the code with a four-module light border", () => {
  const matrix = qrMatrix(SHARE_URL);
  const edge = [
    0,
    1,
    2,
    3,
    matrix.length - 4,
    matrix.length - 3,
    matrix.length - 2,
    matrix.length - 1,
  ];
  const darkEdgeModules = edge.flatMap((line) =>
    matrix.flatMap((row, index) => [row[line], matrix[line][index]]).filter(Boolean),
  );
  expect(matrix.length).toBeGreaterThan(21 + 8);
  expect(darkEdgeModules).toEqual([]);
  expect(matrix[4][4]).toBe(true);
});
