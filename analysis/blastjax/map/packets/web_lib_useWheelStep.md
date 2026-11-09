# Node web:lib:useWheelStep: lib/useWheelStep.ts
Kind: module
Language: typescript, 22 lines of code, location: web/src/lib/useWheelStep.ts

Source excerpt: web/src/lib/useWheelStep.ts (first 24 lines)
```
   1  "use client";
   2  
   3  import { useCallback, useEffect, useRef } from "react";
   4  
   5  export function useWheelStep(step: ((dir: -1 | 1) => void) | null) {
   6    const stepRef = useRef(step);
   7    useEffect(() => {
   8      stepRef.current = step;
   9    });
  10    return useCallback((el: HTMLElement | null) => {
  11      if (!el) return;
  12      let last = -Infinity;
  13      const onWheel = (e: WheelEvent) => {
  14        const fn = stepRef.current;
  15        if (!fn || e.ctrlKey || e.deltaY === 0) return;
  16        e.preventDefault();
  17        if (e.timeStamp - last < 250) return;
  18        last = e.timeStamp;
  19        fn(e.deltaY < 0 ? -1 : 1);
  20      };
  21      el.addEventListener("wheel", onWheel, { passive: false });
  22      return () => el.removeEventListener("wheel", onWheel);
  23    }, []);
  24  }
```

## Outgoing connections
- none

## Incoming connections
- /calendar (web:calendar) -> call
- /commission (web:commission) -> call
- /payslip (web:payslip) -> call
- /salary-stats (web:salary-stats) -> call
