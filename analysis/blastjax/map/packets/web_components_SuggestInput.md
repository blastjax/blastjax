# Node web:components:SuggestInput: components/SuggestInput.tsx
Kind: module
Language: typescript, 103 lines of code, location: web/src/components/SuggestInput.tsx

Source excerpt: web/src/components/SuggestInput.tsx (first 119 lines)
```
   1  "use client";
   2  
   3  import { useEffect, useId, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
   4  import { usePopoverPosition } from "@/lib/usePopoverPosition";
   5  
   6  // Short enough never to scroll: a popover closes on any scroll, even its own.
   7  const MAX_ROWS = 6;
   8  const ROW_HEIGHT = 34;
   9  
  10  export type SuggestInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  11    value: string;
  12    onChange: (value: string) => void;
  13    suggestions: (string | null)[]; // duplicates and blanks are fine
  14    popoverClassName?: string;
  15  };
  16  
  17  // A free-text field that offers values entered before. Anything else can still be typed.
  18  export function SuggestInput({ value, onChange, suggestions, popoverClassName, ...rest }: SuggestInputProps) {
  19    const query = value.trim().toLowerCase();
  20    const sorted = suggestions.flatMap((s) => (s?.trim() ? [s.trim()] : [])).sort((a, b) => a.localeCompare(b));
  21    // Spellings differing only by case become one, and the last wins: "Agoda" sorts after "agoda".
  22    const byKey = new Map(sorted.map((s) => [s.toLowerCase(), s]));
  23    const rows = [...byKey]
  24      .filter(([key]) => key !== query && key.includes(query))
  25      .map(([, text]) => text)
  26      .slice(0, MAX_ROWS);
  27  
  28    const { triggerRef, open, position, openAt, close } = usePopoverPosition<HTMLInputElement>(rows.length * ROW_HEIGHT + 10);
  29    const [width, setWidth] = useState(0);
  30    const [active, setActive] = useState(-1);
  31    const listId = useId();
  32    const shown = open && !!position && rows.length > 0;
  33  
  34    const show = () => {
  35      const w = triggerRef.current?.offsetWidth ?? 0;
  36      setWidth(w);
  37      setActive(-1);
  38      openAt(w);
  39    };
  40  
  41    // A list opened above the field has to stay against it as typing shortens the list.
  42    useEffect(() => {
  43      if (open) show();
  44      // eslint-disable-next-line react-hooks/exhaustive-deps
  45    }, [rows.length]);
  46  
  47    const pick = (text: string) => {
  48      onChange(text);
  49      close();
  50    };
  51  
  52    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
  53      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
  54        e.preventDefault();
  55        if (!shown) return show();
  56        const up = e.key === "ArrowUp";
  57        setActive((i) => (i < 0 && up ? rows.length - 1 : (i + (up ? -1 : 1) + rows.length) % rows.length));
  58      } else if (shown && e.key === "Escape") {
  59        e.stopPropagation(); // closes the list, not the modal around it
  60        close();
  61      } else if (shown && e.key === "Enter" && active >= 0) {
  62        e.preventDefault(); // picks the row instead of submitting the form
  63        pick(rows[active]);
  64      }
  65    };
  66  
  67    return (
  68      <>
  69        <input
  70          {...rest}
  71          ref={triggerRef}
  72          type="text"
  73          role="combobox"
  74          autoComplete="off"
  75          aria-autocomplete="list"
  76          aria-expanded={shown}
  77          aria-controls={shown ? listId : undefined}
  78          aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
  79          value={value}
  80          onChange={(e) => {
  81            onChange(e.target.value);
  82            show();
  83          }}
  84          onFocus={show}
  85          onClick={show}
  86          onBlur={close}
  87          onKeyDown={onKeyDown}
  88        />
  89        {shown && (
  90          <div
  91            id={listId}
  92            role="listbox"
  93            aria-label="Suggestions"
  94            style={{ position: "fixed", top: position.top, left: position.left, width }}
  95            className={`z-50 rounded-lg border p-1 ${popoverClassName ?? "border-line bg-surface shadow-pop"}`}
  96          >
  97            {rows.map((text, i) => (
  98              // Buttons: inside a <label>, a click on anything else would land back on the input.
  99              <button
 100                key={text}
 101                id={`${listId}-${i}`}
 102                type="button"
 103                role="option"
 104                aria-selected={i === active}
 105                tabIndex={-1}
 106                onMouseDown={(e) => e.preventDefault()}
 107                onMouseEnter={() => setActive(i)}
 108                onClick={() => pick(text)}
 109                className={`block w-full cursor-pointer truncate rounded-md px-2.5 text-left text-[13px] ${i === active ? "bg-current/10" : ""}`}
 110                style={{ height: ROW_HEIGHT }}
 111              >
 112                {text}
 113              </button>
 114            ))}
 115          </div>
 116        )}
 117      </>
 118    );
 119  }
```

## Outgoing connections
- call -> lib/usePopoverPosition.ts (web:lib:usePopoverPosition)

## Incoming connections
- /travels (web:travels) -> call
