"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Callback ref that pages a card with the mouse wheel: wheel up calls
 * `step(-1)` (previous month/year), wheel down `step(1)`. The listener is
 * native and non-passive so the page doesn't scroll underneath the card, and
 * throttled so one trackpad flick doesn't fly through a dozen months. Pass
 * `null` to leave the wheel alone (the page scrolls as usual). Ctrl+wheel is
 * left to the browser's zoom.
 */
export function useWheelStep(step: ((dir: -1 | 1) => void) | null) {
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    let last = -Infinity;
    const onWheel = (e: WheelEvent) => {
      const fn = stepRef.current;
      if (!fn || e.ctrlKey || e.deltaY === 0) return;
      e.preventDefault();
      // ponytail: fixed 250ms throttle; accumulate deltaY if trackpads feel jumpy.
      if (e.timeStamp - last < 250) return;
      last = e.timeStamp;
      fn(e.deltaY < 0 ? -1 : 1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
}
