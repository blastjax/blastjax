# Node web:software-architecture: /software-architecture
Kind: module
Language: typescript, 67 lines of code, location: web/src/app/software-architecture

Files in this directory (largest first):
- web/src/app/software-architecture/SoftwareArchitectureClient.tsx
- web/src/app/software-architecture/page.tsx

Source excerpt: web/src/app/software-architecture/SoftwareArchitectureClient.tsx (first 69 lines)
```
   1  "use client";
   2  
   3  import { useEffect, useRef, useState } from "react";
   4  import { CloseIcon } from "@/components/Icons";
   5  import { PageHeader } from "@/components/PageHeader";
   6  import { useTheme } from "@/components/ThemeProvider";
   7  import type { BudgetTheme } from "@/lib/theme";
   8  import { PAGE_CONTAINER_CLASSES } from "@/lib/ui";
   9  
  10  // public/software-architecture.html is rendered by archify; its viewer keeps its own theme, so follow the app's.
  11  function applyTheme(frame: HTMLIFrameElement | null, theme: BudgetTheme) {
  12    frame?.contentDocument?.documentElement.setAttribute("data-theme", theme);
  13  }
  14  
  15  export default function SoftwareArchitectureClient() {
  16    const { theme } = useTheme();
  17    const frame = useRef<HTMLIFrameElement>(null);
  18    // The viewer's Presentation Stage only marks its <html> with data-present, so it can't grow past the
  19    // frame; while it's on, lift the frame over the whole window, sidebar included.
  20    const [presenting, setPresenting] = useState(false);
  21  
  22    useEffect(() => applyTheme(frame.current, theme), [theme]);
  23  
  24    function handleLoad(el: HTMLIFrameElement) {
  25      applyTheme(el, theme);
  26      const root = el.contentDocument?.documentElement;
  27      if (!root) return;
  28      const sync = () => setPresenting(root.getAttribute("data-present") === "true");
  29      new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ["data-present"] });
  30      sync();
  31    }
  32  
  33    // Exit through the viewer's own toggle so its button state, URL and camera reset too.
  34    const exitPresentation = () => frame.current?.contentDocument?.getElementById("btn-present")?.click();
  35  
  36    return (
  37      <div className={PAGE_CONTAINER_CLASSES}>
  38        <PageHeader
  39          title="Software Architecture"
  40          description="How a request reaches the API and the database, which APIs need a login, and what the app calls outside the server."
  41        />
  42        <div className={presenting ? "fixed inset-0 z-[100] flex flex-col bg-page" : "contents"}>
  43          {presenting && (
  44            <div className="flex shrink-0 justify-end px-2 pt-2">
  45              <button
  46                type="button"
  47                aria-label="Exit presentation"
  48                onClick={exitPresentation}
  49                className="grid size-9 place-items-center rounded-lg text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
  50              >
  51                <CloseIcon className="size-5" />
  52              </button>
  53            </div>
  54          )}
  55          <iframe
  56            ref={frame}
  57            src="/software-architecture.html"
  58            title="Software architecture diagram"
  59            onLoad={(e) => handleLoad(e.currentTarget)}
  60            className={
  61              presenting
  62                ? "min-h-0 w-full flex-1"
  63                : "h-[calc(100dvh-12rem)] min-h-[32rem] w-full rounded-lg border border-line bg-surface-2"
  64            }
  65          />
  66        </div>
  67      </div>
  68    );
  69  }
```

## Outgoing connections
- call -> components/Icons.tsx (web:components:Icons)
- call -> components/PageHeader.tsx (web:components:PageHeader)
- call -> components/ThemeProvider.tsx (web:components:ThemeProvider)
- call -> lib/theme.ts (web:lib:theme)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- none
