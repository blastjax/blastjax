"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "@/components/Icons";
import { PageHeader } from "@/components/PageHeader";
import { useTheme } from "@/components/ThemeProvider";
import type { BudgetTheme } from "@/lib/theme";
import { PAGE_CONTAINER_CLASSES } from "@/lib/ui";

// public/software-architecture.html is rendered by archify; its viewer keeps its own theme, so follow the app's.
function applyTheme(frame: HTMLIFrameElement | null, theme: BudgetTheme) {
  frame?.contentDocument?.documentElement.setAttribute("data-theme", theme);
}

export default function SoftwareArchitectureClient() {
  const { theme } = useTheme();
  const frame = useRef<HTMLIFrameElement>(null);
  // The viewer's Presentation Stage only marks its <html> with data-present, so it can't grow past the
  // frame; while it's on, lift the frame over the whole window, sidebar included.
  const [presenting, setPresenting] = useState(false);

  useEffect(() => applyTheme(frame.current, theme), [theme]);

  function handleLoad(el: HTMLIFrameElement) {
    applyTheme(el, theme);
    const root = el.contentDocument?.documentElement;
    if (!root) return;
    const sync = () => setPresenting(root.getAttribute("data-present") === "true");
    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-present"] });
    sync();
  }

  // Exit through the viewer's own toggle so its button state, URL and camera reset too.
  const exitPresentation = () => frame.current?.contentDocument?.getElementById("btn-present")?.click();

  return (
    <div className={PAGE_CONTAINER_CLASSES}>
      <PageHeader
        title="Software Architecture"
        description="How a request reaches the API and the database, which APIs need a login, and what the app calls outside the server."
      />
      <div className={presenting ? "fixed inset-0 z-[100] flex flex-col bg-page" : "contents"}>
        {presenting && (
          <div className="flex shrink-0 justify-end px-2 pt-2">
            <button
              type="button"
              aria-label="Exit presentation"
              onClick={exitPresentation}
              className="grid size-9 place-items-center rounded-lg text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
            >
              <CloseIcon className="size-5" />
            </button>
          </div>
        )}
        <iframe
          ref={frame}
          src="/software-architecture.html"
          title="Software architecture diagram"
          onLoad={(e) => handleLoad(e.currentTarget)}
          className={
            presenting
              ? "min-h-0 w-full flex-1"
              : "h-[calc(100dvh-12rem)] min-h-[32rem] w-full rounded-lg border border-line bg-surface-2"
          }
        />
      </div>
    </div>
  );
}
