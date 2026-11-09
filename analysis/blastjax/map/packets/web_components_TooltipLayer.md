# Node web:components:TooltipLayer: components/TooltipLayer.tsx
Kind: module
Language: typescript, 95 lines of code, location: web/src/components/TooltipLayer.tsx

Source excerpt: web/src/components/TooltipLayer.tsx (first 106 lines)
```
   1  "use client";
   2  
   3  import { useEffect, useLayoutEffect, useRef, useState } from "react";
   4  
   5  const GAP = 8;
   6  const TOOLTIP_ID = "app-tooltip";
   7  
   8  type Tip = { el: Element; text: string };
   9  
  10  // One tooltip for the whole app: any element with data-tooltip="…" gets it on hover or keyboard focus.
  11  export function TooltipLayer() {
  12    const [tip, setTip] = useState<Tip | null>(null);
  13    const ref = useRef<HTMLDivElement>(null);
  14  
  15    useEffect(() => {
  16      let active: Element | null = null;
  17      let shown = false;
  18      let timer = 0;
  19      const show = (el: Element) => {
  20        const text = el.getAttribute("data-tooltip");
  21        if (!text) return;
  22        shown = true;
  23        setTip({ el, text });
  24      };
  25      const hide = () => {
  26        window.clearTimeout(timer);
  27        active = null;
  28        shown = false;
  29        setTip(null);
  30      };
  31      const owner = (e: Event) => (e.target instanceof Element ? e.target.closest("[data-tooltip]") : null);
  32  
  33      const onOver = (e: PointerEvent) => {
  34        if (e.pointerType !== "mouse") return;
  35        const el = owner(e);
  36        if (el === active) return;
  37        if (!el) return hide();
  38        window.clearTimeout(timer);
  39        active = el;
  40        if (shown) show(el);
  41        else timer = window.setTimeout(() => show(el), 400);
  42      };
  43      const onOut = (e: PointerEvent) => {
  44        if (!e.relatedTarget) hide();
  45      };
  46      const onFocusIn = (e: FocusEvent) => {
  47        const el = owner(e);
  48        if (!el || !(e.target as Element).matches(":focus-visible")) return;
  49        window.clearTimeout(timer);
  50        active = el;
  51        show(el);
  52      };
  53      const onKey = (e: KeyboardEvent) => {
  54        if (e.key === "Escape") hide();
  55      };
  56  
  57      document.addEventListener("pointerover", onOver);
  58      document.addEventListener("pointerout", onOut);
  59      document.addEventListener("pointerdown", hide);
  60      document.addEventListener("focusin", onFocusIn);
  61      document.addEventListener("focusout", hide);
  62      document.addEventListener("keydown", onKey);
  63      window.addEventListener("scroll", hide, true);
  64      window.addEventListener("resize", hide);
  65      return () => {
  66        window.clearTimeout(timer);
  67        document.removeEventListener("pointerover", onOver);
  68        document.removeEventListener("pointerout", onOut);
  69        document.removeEventListener("pointerdown", hide);
  70        document.removeEventListener("focusin", onFocusIn);
  71        document.removeEventListener("focusout", hide);
  72        document.removeEventListener("keydown", onKey);
  73        window.removeEventListener("scroll", hide, true);
  74        window.removeEventListener("resize", hide);
  75      };
  76    }, []);
  77  
  78    useLayoutEffect(() => {
  79      const box = ref.current;
  80      if (!tip || !box) return;
  81      const r = tip.el.getBoundingClientRect();
  82      const above = r.top - box.offsetHeight - GAP;
  83      const left = r.left + r.width / 2 - box.offsetWidth / 2;
  84      box.style.top = `${above >= GAP ? above : r.bottom + GAP}px`;
  85      box.style.left = `${Math.max(GAP, Math.min(left, window.innerWidth - box.offsetWidth - GAP))}px`;
  86      box.style.visibility = "visible";
  87    }, [tip]);
  88  
  89    useEffect(() => {
  90      if (!tip || tip.el.hasAttribute("aria-describedby")) return;
  91      tip.el.setAttribute("aria-describedby", TOOLTIP_ID);
  92      return () => tip.el.removeAttribute("aria-describedby");
  93    }, [tip]);
  94  
  95    if (!tip) return null;
  96    return (
  97      <div
  98        ref={ref}
  99        id={TOOLTIP_ID}
 100        role="tooltip"
 101        className="pointer-events-none invisible fixed left-0 top-0 z-[80] max-w-xs whitespace-pre-line rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs leading-snug text-ink shadow-pop"
 102      >
 103        {tip.text}
 104      </div>
 105    );
 106  }
```

## Outgoing connections
- none

## Incoming connections
- layout + error (web:layout) -> call
