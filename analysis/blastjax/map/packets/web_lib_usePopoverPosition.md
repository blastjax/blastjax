# Node web:lib:usePopoverPosition: lib/usePopoverPosition.ts
Kind: module
Language: typescript, 38 lines of code, location: web/src/lib/usePopoverPosition.ts

Source excerpt: web/src/lib/usePopoverPosition.ts (first 45 lines)
```
   1  "use client";
   2  
   3  import { useEffect, useRef, useState } from "react";
   4  
   5  export type PopoverPos = { top: number; left: number };
   6  
   7  export function usePopoverPosition<T extends HTMLElement>(estimatedHeight = 360) {
   8    const triggerRef = useRef<T>(null);
   9    const [open, setOpen] = useState(false);
  10    const [position, setPosition] = useState<PopoverPos | null>(null);
  11  
  12    const openAt = (width: number) => {
  13      const el = triggerRef.current;
  14      if (el) {
  15        const margin = 8;
  16        const rect = el.getBoundingClientRect();
  17        const left = Math.min(
  18          Math.max(margin, rect.left),
  19          Math.max(margin, window.innerWidth - width - margin),
  20        );
  21        const spaceBelow = window.innerHeight - rect.bottom;
  22        const top =
  23          spaceBelow < estimatedHeight + margin && rect.top > estimatedHeight
  24            ? Math.max(margin, rect.top - estimatedHeight - 8)
  25            : rect.bottom + 8;
  26        setPosition({ top, left });
  27      }
  28      setOpen(true);
  29    };
  30  
  31    const close = () => setOpen(false);
  32  
  33    useEffect(() => {
  34      if (!open) return;
  35      const onScrollOrResize = () => close();
  36      window.addEventListener("scroll", onScrollOrResize, true);
  37      window.addEventListener("resize", onScrollOrResize);
  38      return () => {
  39        window.removeEventListener("scroll", onScrollOrResize, true);
  40        window.removeEventListener("resize", onScrollOrResize);
  41      };
  42    }, [open]);
  43  
  44    return { triggerRef, open, position, openAt, close };
  45  }
```

## Outgoing connections
- none

## Incoming connections
- components/PickerField.tsx (web:components:PickerField) -> call
- components/SuggestInput.tsx (web:components:SuggestInput) -> call
