# Node web:lib:chartAxis: lib/chartAxis.ts
Kind: module
Language: typescript, 12 lines of code, location: web/src/lib/chartAxis.ts

Source excerpt: web/src/lib/chartAxis.ts (first 13 lines)
```
   1  export function xAxisTickInterval(pointCount: number, maxTicks = 7): number {
   2    if (pointCount <= maxTicks) return 0;
   3    return Math.ceil(pointCount / maxTicks) - 1;
   4  }
   5  
   6  export function chartScrollMinWidth(
   7    pointCount: number,
   8    pxPerPoint = 56,
   9    floorPx = 480,
  10    capPx = 6000,
  11  ): number {
  12    return Math.min(capPx, Math.max(floorPx, pointCount * pxPerPoint));
  13  }
```

## Outgoing connections
- none

## Incoming connections
- /blood-pressure (web:blood-pressure) -> call
