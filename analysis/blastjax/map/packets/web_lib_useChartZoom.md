# Node web:lib:useChartZoom: lib/useChartZoom.ts
Kind: module
Language: typescript, 21 lines of code, location: web/src/lib/useChartZoom.ts

Source excerpt: web/src/lib/useChartZoom.ts (first 25 lines)
```
   1  import { useCallback, useState } from "react";
   2  
   3  const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;
   4  const DEFAULT_STEP_INDEX = ZOOM_STEPS.indexOf(1);
   5  
   6  export function useChartZoom() {
   7    const [stepIndex, setStepIndex] = useState(DEFAULT_STEP_INDEX);
   8  
   9    const zoomIn = useCallback(() => {
  10      setStepIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1));
  11    }, []);
  12    const zoomOut = useCallback(() => {
  13      setStepIndex((i) => Math.max(0, i - 1));
  14    }, []);
  15    const resetZoom = useCallback(() => setStepIndex(DEFAULT_STEP_INDEX), []);
  16  
  17    return {
  18      zoom: ZOOM_STEPS[stepIndex],
  19      zoomIn,
  20      zoomOut,
  21      resetZoom,
  22      canZoomIn: stepIndex < ZOOM_STEPS.length - 1,
  23      canZoomOut: stepIndex > 0,
  24    };
  25  }
```

## Outgoing connections
- none

## Incoming connections
- /blood-pressure (web:blood-pressure) -> call
