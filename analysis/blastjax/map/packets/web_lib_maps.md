# Node web:lib:maps: lib/maps.ts
Kind: module
Language: typescript, 13 lines of code, location: web/src/lib/maps.ts

Source excerpt: web/src/lib/maps.ts (first 14 lines)
```
   1  export function googleMapsSearchUrl(query: string): string {
   2    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
   3  }
   4  
   5  export function mapsUrlFor(
   6    name: string | null | undefined,
   7    customUrl: string | null | undefined,
   8  ): string | null {
   9    const trimmedUrl = customUrl?.trim();
  10    if (trimmedUrl) return trimmedUrl;
  11    const trimmedName = name?.trim();
  12    if (trimmedName) return googleMapsSearchUrl(trimmedName);
  13    return null;
  14  }
```

## Outgoing connections
- none

## Incoming connections
- /travels (web:travels) -> call
