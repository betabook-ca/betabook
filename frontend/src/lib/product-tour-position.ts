export type TourRect = { left: number; top: number; width: number; height: number };

/** Keep the highlight inside the demo's scroll area, away from the guide and app shell. */
export function clipTourTarget(target: TourRect, viewport: TourRect): TourRect | null {
  const left = Math.max(target.left - 6, viewport.left);
  const top = Math.max(target.top - 6, viewport.top);
  const right = Math.min(target.left + target.width + 6, viewport.left + viewport.width);
  const bottom = Math.min(target.top + target.height + 6, viewport.top + viewport.height);
  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : null;
}

/** Scroll only as far as needed; preserve the surrounding page context when it already fits. */
export function tourTargetScrollDelta(target: TourRect, viewport: TourRect, introduce = false) {
  const top = viewport.top + 12;
  const bottom = viewport.top + viewport.height - 12;
  if (introduce) return target.top - top - Math.max(0, (bottom - top - target.height) / 3);
  if (target.top < top || target.height > bottom - top) return target.top - top;
  if (target.top + target.height > bottom) return target.top + target.height - bottom;
  return 0;
}
