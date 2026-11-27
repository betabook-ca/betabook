import { encode } from "uqr";

export type QrMatrix = boolean[][];

/** Dark modules are `true`. Includes the four-module light border scanners
 * need to find the code. */
export function qrMatrix(value: string): QrMatrix {
  return encode(value, { ecc: "M", border: 4 }).data;
}

/** An SVG path with one subpath per horizontal run of dark modules, in module
 * units. */
export function qrPath(matrix: QrMatrix): string {
  let path = "";
  for (const [y, row] of matrix.entries()) {
    let start = -1;
    for (const [x, dark] of [...row, false].entries()) {
      if (dark && start < 0) start = x;
      if (!dark && start >= 0) {
        path += `M${start} ${y}h${x - start}v1h${start - x}z`;
        start = -1;
      }
    }
  }
  return path;
}

/** Opaque black-on-white RGBA pixels, whatever the theme: scanners need the
 * contrast. */
export function qrPixels(matrix: QrMatrix, scale: number) {
  const width = matrix.length * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let py = 0; py < width; py += 1) {
    for (let px = 0; px < width; px += 1) {
      if (matrix[Math.floor(py / scale)][Math.floor(px / scale)]) {
        const offset = (py * width + px) * 4;
        data.fill(0, offset, offset + 3);
      }
    }
  }
  return { data, width };
}
