export function xAxisTickInterval(pointCount: number, maxTicks = 7): number {
  if (pointCount <= maxTicks) return 0;
  return Math.ceil(pointCount / maxTicks) - 1;
}

export function chartScrollMinWidth(
  pointCount: number,
  pxPerPoint = 56,
  floorPx = 480,
  capPx = 6000,
): number {
  return Math.min(capPx, Math.max(floorPx, pointCount * pxPerPoint));
}
