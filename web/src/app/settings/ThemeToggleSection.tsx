"use client";

import { useTheme } from "@/components/ThemeProvider";

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function ThemeToggleSection() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Appearance
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Light mode or OLED-friendly dark (true black).
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        onClick={toggleTheme}
        className="relative inline-flex h-11 w-[5.5rem] shrink-0 items-center rounded-full border border-zinc-300 bg-gradient-to-r from-amber-50 to-sky-50 p-1 shadow-inner transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-zinc-800 dark:from-zinc-950 dark:to-black dark:focus-visible:ring-offset-black"
      >
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 z-0 -translate-y-1/2 text-amber-600 dark:text-amber-400/90"
          aria-hidden
        >
          <SunIcon className="size-[1.125rem]" />
        </span>
        <span
          className="pointer-events-none absolute right-2.5 top-1/2 z-0 -translate-y-1/2 text-indigo-600 dark:text-indigo-300/90"
          aria-hidden
        >
          <MoonIcon className="size-[1.125rem]" />
        </span>
        <span
          className={[
            "pointer-events-none absolute left-1 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-200 ease-out dark:bg-zinc-800 dark:ring-white/10",
            isDark ? "translate-x-[2.5rem]" : "translate-x-0",
          ].join(" ")}
          aria-hidden
        />
      </button>
    </div>
  );
}
