"use client";

import { useEffect, useRef, useState } from "react";

export type PopoverPos = { top: number; left: number };

export function usePopoverPosition<T extends HTMLElement>(estimatedHeight = 360) {
  const triggerRef = useRef<T>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPos | null>(null);

  const openAt = (width: number) => {
    const el = triggerRef.current;
    if (el) {
      const margin = 8;
      const rect = el.getBoundingClientRect();
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - width - margin),
      );
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow < estimatedHeight + margin && rect.top > estimatedHeight
          ? Math.max(margin, rect.top - estimatedHeight - 8)
          : rect.bottom + 8;
      setPosition({ top, left });
    }
    setOpen(true);
  };

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => close();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return { triggerRef, open, position, openAt, close };
}
