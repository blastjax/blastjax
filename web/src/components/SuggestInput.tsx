"use client";

import { useEffect, useId, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { usePopoverPosition } from "@/lib/usePopoverPosition";

// Short enough never to scroll: a popover closes on any scroll, even its own.
const MAX_ROWS = 6;
const ROW_HEIGHT = 34;

export type SuggestInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  suggestions: (string | null)[]; // duplicates and blanks are fine
  popoverClassName?: string;
};

// A free-text field that offers values entered before. Anything else can still be typed.
export function SuggestInput({ value, onChange, suggestions, popoverClassName, ...rest }: SuggestInputProps) {
  const query = value.trim().toLowerCase();
  const sorted = suggestions.flatMap((s) => (s?.trim() ? [s.trim()] : [])).sort((a, b) => a.localeCompare(b));
  // Spellings differing only by case become one, and the last wins: "Agoda" sorts after "agoda".
  const byKey = new Map(sorted.map((s) => [s.toLowerCase(), s]));
  const rows = [...byKey]
    .filter(([key]) => key !== query && key.includes(query))
    .map(([, text]) => text)
    .slice(0, MAX_ROWS);

  const { triggerRef, open, position, openAt, close } = usePopoverPosition<HTMLInputElement>(rows.length * ROW_HEIGHT + 10);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const shown = open && !!position && rows.length > 0;

  const show = () => {
    const w = triggerRef.current?.offsetWidth ?? 0;
    setWidth(w);
    setActive(-1);
    openAt(w);
  };

  // A list opened above the field has to stay against it as typing shortens the list.
  useEffect(() => {
    if (open) show();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const pick = (text: string) => {
    onChange(text);
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!shown) return show();
      const up = e.key === "ArrowUp";
      setActive((i) => (i < 0 && up ? rows.length - 1 : (i + (up ? -1 : 1) + rows.length) % rows.length));
    } else if (shown && e.key === "Escape") {
      e.stopPropagation(); // closes the list, not the modal around it
      close();
    } else if (shown && e.key === "Enter" && active >= 0) {
      e.preventDefault(); // picks the row instead of submitting the form
      pick(rows[active]);
    }
  };

  return (
    <>
      <input
        {...rest}
        ref={triggerRef}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={shown ? listId : undefined}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          show();
        }}
        onFocus={show}
        onClick={show}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      {shown && (
        <div
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          style={{ position: "fixed", top: position.top, left: position.left, width }}
          className={`z-50 rounded-lg border p-1 ${popoverClassName ?? "border-line bg-surface shadow-pop"}`}
        >
          {rows.map((text, i) => (
            // Buttons: inside a <label>, a click on anything else would land back on the input.
            <button
              key={text}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(text)}
              className={`block w-full cursor-pointer truncate rounded-md px-2.5 text-left text-[13px] ${i === active ? "bg-current/10" : ""}`}
              style={{ height: ROW_HEIGHT }}
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
