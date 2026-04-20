"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getFacet, getWorkbookFacet } from "@/lib/api";
import { fieldLabelText, inputClass } from "@/lib/ui";

type Props = {
  /**
   * When true, load suggestions from `/api/workbook/facet/...` (values from this
   * `column` across all sheets). Ignores `sheet`. Use for Category / Subcategory
   * so suggestions are never tied to another column on one sheet.
   */
  workbookWide?: boolean;
  /** Required unless `workbookWide` is true. */
  sheet?: string;
  column: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /**
   * When set, the datalist uses only this list (filtered by the current value),
   * and facet APIs are not called — e.g. subcategories under a selected category
   * from the category catalog.
   */
  staticOptions?: string[];
};

/** Suggestions from sheet or workbook facet APIs (existing distinct values). */
export function FacetAutocomplete({
  workbookWide = false,
  sheet = "",
  column,
  label,
  value,
  onChange,
  disabled,
  staticOptions,
}: Props) {
  const reactId = useId();
  const listId = `facet-ac-${column}-${reactId.replace(/:/g, "")}`;
  const [options, setOptions] = useState<string[]>([]);
  const fetchGen = useRef(0);

  useEffect(() => {
    if (!column) return;
    if (staticOptions !== undefined) {
      const q = value.trim().toLowerCase();
      setOptions(
        staticOptions
          .filter((s) => !q || s.toLowerCase().includes(q))
          .slice(0, 80),
      );
      return;
    }
    if (!workbookWide && !sheet) return;
    let cancelled = false;
    const myGen = ++fetchGen.current;
    const t = setTimeout(() => {
      const req = workbookWide
        ? getWorkbookFacet(column, {
            q: value.trim() || undefined,
            limit: 80,
            sort: "alpha",
          })
        : getFacet(sheet, column, {
            q: value.trim() || undefined,
            limit: 80,
            sort: "alpha",
          });
      req
        .then((r) => {
          if (cancelled || myGen !== fetchGen.current) return;
          if (r.kind === "datetime") return;
          setOptions(r.items.map((x) => x.value));
        })
        .catch(() => {
          if (cancelled || myGen !== fetchGen.current) return;
          setOptions([]);
        });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [workbookWide, sheet, column, value, staticOptions]);

  return (
    <label className="flex flex-col gap-1">
      <span className={fieldLabelText}>{label}</span>
      <input
        className={inputClass}
        name={`facet-${column}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        disabled={disabled}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
    </label>
  );
}
