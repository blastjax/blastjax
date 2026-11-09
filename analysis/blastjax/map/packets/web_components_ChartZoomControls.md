# Node web:components:ChartZoomControls: components/ChartZoomControls.tsx
Kind: module
Language: typescript, 51 lines of code, location: web/src/components/ChartZoomControls.tsx

Source excerpt: web/src/components/ChartZoomControls.tsx (first 52 lines)
```
   1  import { CHART_ZOOM_BUTTON_CLASSES } from "@/lib/ui";
   2  
   3  export function ChartZoomControls({
   4    zoom,
   5    onZoomIn,
   6    onZoomOut,
   7    onReset,
   8    canZoomIn,
   9    canZoomOut,
  10  }: {
  11    zoom: number;
  12    onZoomIn: () => void;
  13    onZoomOut: () => void;
  14    onReset: () => void;
  15    canZoomIn: boolean;
  16    canZoomOut: boolean;
  17  }) {
  18    return (
  19      <div
  20        className="inline-flex items-center gap-1.5"
  21        role="group"
  22        aria-label="Chart zoom"
  23      >
  24        <button
  25          type="button"
  26          className={CHART_ZOOM_BUTTON_CLASSES}
  27          onClick={onZoomOut}
  28          disabled={!canZoomOut}
  29          aria-label="Zoom out"
  30        >
  31          −
  32        </button>
  33        <button
  34          type="button"
  35          onClick={onReset}
  36          data-tooltip="Reset zoom"
  37          className="min-w-[3.5rem] rounded-full px-1 py-1 text-center text-xs font-semibold tabular-nums text-indigo-700 transition-colors duration-150 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
  38        >
  39          {Math.round(zoom * 100)}%
  40        </button>
  41        <button
  42          type="button"
  43          className={CHART_ZOOM_BUTTON_CLASSES}
  44          onClick={onZoomIn}
  45          disabled={!canZoomIn}
  46          aria-label="Zoom in"
  47        >
  48          +
  49        </button>
  50      </div>
  51    );
  52  }
```

## Outgoing connections
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- /blood-pressure (web:blood-pressure) -> call
