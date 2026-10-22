"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const GAP = 8;
const TOOLTIP_ID = "app-tooltip";

type Tip = { el: Element; text: string };

// One tooltip for the whole app: any element with data-tooltip="…" gets it on hover or keyboard focus.
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active: Element | null = null;
    let shown = false;
    let timer = 0;
    const show = (el: Element) => {
      const text = el.getAttribute("data-tooltip");
      if (!text) return;
      shown = true;
      setTip({ el, text });
    };
    const hide = () => {
      window.clearTimeout(timer);
      active = null;
      shown = false;
      setTip(null);
    };
    const owner = (e: Event) => (e.target instanceof Element ? e.target.closest("[data-tooltip]") : null);

    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = owner(e);
      if (el === active) return;
      if (!el) return hide();
      window.clearTimeout(timer);
      active = el;
      if (shown) show(el);
      else timer = window.setTimeout(() => show(el), 400);
    };
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) hide();
    };
    const onFocusIn = (e: FocusEvent) => {
      const el = owner(e);
      if (!el || !(e.target as Element).matches(":focus-visible")) return;
      window.clearTimeout(timer);
      active = el;
      show(el);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!tip || !box) return;
    const r = tip.el.getBoundingClientRect();
    const above = r.top - box.offsetHeight - GAP;
    const left = r.left + r.width / 2 - box.offsetWidth / 2;
    box.style.top = `${above >= GAP ? above : r.bottom + GAP}px`;
    box.style.left = `${Math.max(GAP, Math.min(left, window.innerWidth - box.offsetWidth - GAP))}px`;
    box.style.visibility = "visible";
  }, [tip]);

  useEffect(() => {
    if (!tip || tip.el.hasAttribute("aria-describedby")) return;
    tip.el.setAttribute("aria-describedby", TOOLTIP_ID);
    return () => tip.el.removeAttribute("aria-describedby");
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={ref}
      id={TOOLTIP_ID}
      role="tooltip"
      className="pointer-events-none invisible fixed left-0 top-0 z-[80] max-w-xs whitespace-pre-line rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs leading-snug text-ink shadow-pop"
    >
      {tip.text}
    </div>
  );
}
