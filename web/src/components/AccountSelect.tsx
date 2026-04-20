"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fieldLabelText, inputClass } from "@/lib/ui";

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** From `useVisibleAccountNames` (shown accounts only, settings order). */
  options: string[];
  placeholder?: string;
};

/**
 * Searchable account field: filters within the ordered options from Settings
 * (visibility + manual order via `useVisibleAccountNames`).
 */
export function AccountSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Search or select account…",
}: Props) {
  const merged = useMemo(() => {
    const o = [...options];
    if (value !== "" && !o.includes(value)) {
      return [value, ...o];
    }
    return o;
  }, [options, value]);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setSearch(value);
  }, [value, open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter((name) => name.toLowerCase().includes(q));
  }, [merged, search]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="flex flex-col gap-1">
      <span className={fieldLabelText}>{label}</span>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          className={inputClass}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {open && (
          <ul
            className="absolute z-50 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
            role="listbox"
          >
            <li>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange("");
                  setSearch("");
                  setOpen(false);
                }}
              >
                (none)
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-2 py-2 text-sm text-zinc-500">No matches</li>
            ) : (
              filtered.map((name) => (
                <li key={name === "" ? "__empty__" : name}>
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-left text-sm text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(name);
                      setSearch(name === "" ? "" : name);
                      setOpen(false);
                    }}
                  >
                    {name === "" ? "(empty)" : name}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
