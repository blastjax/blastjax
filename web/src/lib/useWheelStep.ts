"use client";

import { useCallback, useEffect, useRef } from "react";

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
      if (e.timeStamp - last < 250) return;
      last = e.timeStamp;
      fn(e.deltaY < 0 ? -1 : 1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
}
