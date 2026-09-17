import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { ThemeInitScript } from "@/components/ThemeInitScript";
import { ThemeProvider } from "@/components/ThemeProvider";
import { THEME_COLOR } from "@/lib/theme";
import "./globals.css";

const sans = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Blastjax",
  description: "Payslip calendar, loan schedules, health and travel",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${sans.variable} ${mono.variable} bg-page font-sans text-base leading-normal text-ink antialiased max-sm:text-[16px] max-sm:leading-[1.6] sm:leading-normal`}
      >
        <ThemeInitScript />
        <a
          href="#main-content"
          className="fixed left-3 top-3 z-[100] -translate-y-16 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-on transition-transform duration-150 focus-visible:translate-y-0"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <AuthGate>
            <AppShell>{children}</AppShell>
          </AuthGate>
        </ThemeProvider>
      </body>
    </html>
  );
}
