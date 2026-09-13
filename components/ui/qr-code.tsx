"use client";

import { useMemo } from "react";

import { qrMatrix, qrPath } from "@/lib/qr-code";

/** Always black on white, including the dark theme: scanners need the
 * contrast. */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${matrix.length} ${matrix.length}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={matrix.length} height={matrix.length} fill="#fff" />
      <path d={qrPath(matrix)} fill="#000" />
    </svg>
  );
}
