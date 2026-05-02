"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  CHART_SERIES_COLOR_KEYS,
  CHART_SERIES_LABEL,
  defaultChartPalette,
  loadChartPalette,
  normalizeHexForColorInput,
  saveChartPalette,
  type ChartPaletteByTheme,
} from "@/lib/chartPalette";
import type { BudgetTheme } from "@/lib/theme";

export function ChartColorsSettingsPanel() {
  const { setTheme } = useTheme();
  const [chartPalette, setChartPalette] = useState<ChartPaletteByTheme>(() =>
    loadChartPalette(),
  );
  const [paletteEditorTheme, setPaletteEditorTheme] =
    useState<BudgetTheme>("light");
  const [paletteSaveMsg, setPaletteSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!paletteSaveMsg) return;
    const t = window.setTimeout(() => setPaletteSaveMsg(null), 2800);
    return () => window.clearTimeout(t);
  }, [paletteSaveMsg]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
        Chart colors
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        The composition pie chart, trend line chart, and series checkboxes on
        Salary Stats use these colors. Set one palette for light app theme and
        another for dark; charts pick the row that matches the current theme.
        Switch the app theme below or from the sidebar to preview.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          Editing palette for
        </span>
        <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              paletteEditorTheme === "light"
                ? "bg-indigo-600 text-white"
                : "text-zinc-700 dark:text-zinc-300"
            }`}
            onClick={() => setPaletteEditorTheme("light")}
          >
            Light mode
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              paletteEditorTheme === "dark"
                ? "bg-indigo-600 text-white"
                : "text-zinc-700 dark:text-zinc-300"
            }`}
            onClick={() => setPaletteEditorTheme("dark")}
          >
            Dark mode
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
          onClick={() => setTheme("light")}
        >
          App: light
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
          onClick={() => setTheme("dark")}
        >
          App: dark
        </button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CHART_SERIES_COLOR_KEYS.map((k) => (
          <label
            key={k}
            className="flex min-w-0 items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/40"
          >
            <span className="text-sm text-zinc-700 dark:text-zinc-200">
              {CHART_SERIES_LABEL[k]}
            </span>
            <input
              type="color"
              aria-label={`Color for ${CHART_SERIES_LABEL[k]} (${paletteEditorTheme})`}
              className="h-9 w-14 cursor-pointer rounded border border-zinc-300 bg-white p-0.5 dark:border-zinc-600 dark:bg-zinc-950"
              value={normalizeHexForColorInput(
                chartPalette[paletteEditorTheme][k],
              )}
              onChange={(e) => {
                const v = e.target.value;
                setChartPalette((p) => ({
                  ...p,
                  [paletteEditorTheme]: {
                    ...p[paletteEditorTheme],
                    [k]: v,
                  },
                }));
              }}
            />
          </label>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          onClick={() => {
            saveChartPalette(chartPalette);
            setPaletteSaveMsg("Palette saved to this browser.");
          }}
        >
          Save palette
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
          onClick={() => {
            setChartPalette((p) => ({
              ...p,
              [paletteEditorTheme]: {
                ...defaultChartPalette()[paletteEditorTheme],
              },
            }));
            setPaletteSaveMsg(
              `Reset ${paletteEditorTheme} palette to built-in defaults (not saved yet).`,
            );
          }}
        >
          Reset {paletteEditorTheme} row
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
          onClick={() => {
            setChartPalette(defaultChartPalette());
            setPaletteSaveMsg(
              "Reset both light and dark to built-in defaults (not saved yet).",
            );
          }}
        >
          Reset all
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
          onClick={() => {
            setChartPalette(loadChartPalette());
            setPaletteSaveMsg("Reloaded palette from storage.");
          }}
        >
          Reload saved
        </button>
        {paletteSaveMsg && (
          <span className="text-sm text-emerald-700 dark:text-emerald-400">
            {paletteSaveMsg}
          </span>
        )}
      </div>
    </section>
  );
}
