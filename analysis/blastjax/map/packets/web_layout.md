# Node web:layout: layout + error
Kind: module
Language: typescript, 100 lines of code, location: web/src/app/layout.tsx

Source excerpt: web/src/app/layout.tsx (first 67 lines)
```
   1  import type { Metadata, Viewport } from "next";
   2  import { IBM_Plex_Mono, Manrope } from "next/font/google";
   3  import { AppShell } from "@/components/AppShell";
   4  import { AuthGate } from "@/components/AuthGate";
   5  import { ConfirmHost } from "@/components/ConfirmDialog";
   6  import { ThemeInitScript } from "@/components/ThemeInitScript";
   7  import { ThemeProvider } from "@/components/ThemeProvider";
   8  import { TooltipLayer } from "@/components/TooltipLayer";
   9  import { THEME_COLOR } from "@/lib/theme";
  10  import "./globals.css";
  11  
  12  const sans = Manrope({
  13    variable: "--font-sans",
  14    subsets: ["latin"],
  15    weight: ["400", "500", "600", "700", "800"],
  16  });
  17  
  18  const mono = IBM_Plex_Mono({
  19    variable: "--font-mono",
  20    subsets: ["latin"],
  21    weight: ["400", "500", "600"],
  22  });
  23  
  24  export const metadata: Metadata = {
  25    title: "Blastjax",
  26    description: "Payslip calendar, loan schedules, health and travel",
  27  };
  28  
  29  export const viewport: Viewport = {
  30    width: "device-width",
  31    initialScale: 1,
  32    maximumScale: 5,
  33    viewportFit: "cover",
  34    themeColor: [
  35      { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
  36      { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  37    ],
  38  };
  39  
  40  export default function RootLayout({
  41    children,
  42  }: Readonly<{
  43    children: React.ReactNode;
  44  }>) {
  45    return (
  46      <html lang="en" suppressHydrationWarning>
  47        <body
  48          className={`${sans.variable} ${mono.variable} bg-page font-sans text-base leading-normal text-ink antialiased max-sm:text-[16px] max-sm:leading-[1.6] sm:leading-normal`}
  49        >
  50          <ThemeInitScript />
  51          <a
  52            href="#main-content"
  53            className="fixed left-3 top-3 z-[100] -translate-y-16 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-on transition-transform duration-150 focus-visible:translate-y-0"
  54          >
  55            Skip to content
  56          </a>
  57          <ThemeProvider>
  58            <AuthGate>
  59              <AppShell>{children}</AppShell>
  60            </AuthGate>
  61            <ConfirmHost />
  62            <TooltipLayer />
  63          </ThemeProvider>
  64        </body>
  65      </html>
  66    );
  67  }
```

## Outgoing connections
- call -> components/AppShell.tsx (web:components:AppShell)
- call -> components/AuthGate.tsx (web:components:AuthGate)
- call -> components/ConfirmDialog.tsx (web:components:ConfirmDialog)
- call -> components/ThemeInitScript.tsx (web:components:ThemeInitScript)
- call -> components/ThemeProvider.tsx (web:components:ThemeProvider)
- call -> components/TooltipLayer.tsx (web:components:TooltipLayer)
- call -> lib/theme.ts (web:lib:theme)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- none
