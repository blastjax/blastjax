import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { ThemeInitScript } from "@/components/ThemeInitScript";
import { ThemeProvider } from "@/components/ThemeProvider";
import { THEME_COLOR } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
        className={`${geistSans.variable} ${geistMono.variable} bg-page font-sans text-base leading-normal text-ink antialiased max-sm:text-[16px] max-sm:leading-[1.6] sm:leading-normal`}
      >
        <ThemeInitScript />
        <a
          href="#main-content"
          className="fixed left-3 top-3 z-[100] -translate-y-16 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-transform duration-150 focus-visible:translate-y-0"
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
