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
import {
  ACTION_BUTTON_CLASSES,
  CARD_CLASSES,
  PRIMARY_BUTTON_CLASSES,
  SEGMENTED_BUTTON_ACTIVE_CLASSES,
  SEGMENTED_BUTTON_CLASSES,
  SEGMENTED_BUTTON_INACTIVE_CLASSES,
  SEGMENTED_WRAPPER_CLASSES,
} from "@/lib/ui";

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
    <section className={CARD_CLASSES}>
      <h2 className="text-lg font-medium text-ink">
        Chart colors
      </h2>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-sm text-ink-2">
          Editing palette for
        </span>
        <div className={SEGMENTED_WRAPPER_CLASSES} role="tablist" aria-label="Palette theme">
          <button
            type="button"
            role="tab"
            aria-selected={paletteEditorTheme === "light"}
            className={`${SEGMENTED_BUTTON_CLASSES} ${
              paletteEditorTheme === "light"
                ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                : SEGMENTED_BUTTON_INACTIVE_CLASSES
            }`}
            onClick={() => setPaletteEditorTheme("light")}
          >
            Light mode
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={paletteEditorTheme === "dark"}
            className={`${SEGMENTED_BUTTON_CLASSES} ${
              paletteEditorTheme === "dark"
                ? SEGMENTED_BUTTON_ACTIVE_CLASSES
                : SEGMENTED_BUTTON_INACTIVE_CLASSES
            }`}
            onClick={() => setPaletteEditorTheme("dark")}
          >
            Dark mode
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" className={ACTION_BUTTON_CLASSES} onClick={() => setTheme("light")}>
          App: light
        </button>
        <button type="button" className={ACTION_BUTTON_CLASSES} onClick={() => setTheme("dark")}>
          App: dark
        </button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CHART_SERIES_COLOR_KEYS.map((k) => (
          <label
            key={k}
            className="flex min-w-0 items-center justify-between gap-4 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5"
          >
            <span className="text-sm text-ink-2">
              {CHART_SERIES_LABEL[k]}
            </span>
            <input
              type="color"
              aria-label={`Color for ${CHART_SERIES_LABEL[k]} (${paletteEditorTheme})`}
              className="h-9 w-14 cursor-pointer rounded-md border border-line-strong bg-transparent p-0.5"
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
          className={PRIMARY_BUTTON_CLASSES}
          onClick={() => {
            saveChartPalette(chartPalette);
            setPaletteSaveMsg("Palette saved to this browser.");
          }}
        >
          Save palette
        </button>
        <button
          type="button"
          className={ACTION_BUTTON_CLASSES}
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
          className={ACTION_BUTTON_CLASSES}
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
          className={ACTION_BUTTON_CLASSES}
          onClick={() => {
            setChartPalette(loadChartPalette());
            setPaletteSaveMsg("Reloaded palette from storage.");
          }}
        >
          Reload saved
        </button>
        {paletteSaveMsg && (
          <span className="text-sm text-success-text">
            {paletteSaveMsg}
          </span>
        )}
      </div>
    </section>
  );
}
