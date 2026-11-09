# Node web:components:ThemeInitScript: components/ThemeInitScript.tsx
Kind: module
Language: typescript, 15 lines of code, location: web/src/components/ThemeInitScript.tsx

Source excerpt: web/src/components/ThemeInitScript.tsx (first 16 lines)
```
   1  import { BUDGET_THEME_STORAGE_KEY, THEME_COLOR } from "@/lib/theme";
   2  
   3  export function ThemeInitScript() {
   4    const js = `(function(){
   5    try {
   6      var k=${JSON.stringify(BUDGET_THEME_STORAGE_KEY)};
   7      var light=${JSON.stringify(THEME_COLOR.light)}, dark_c=${JSON.stringify(THEME_COLOR.dark)};
   8      var t=localStorage.getItem(k);
   9      var dark = t==="dark" || (t!=="light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  10      document.documentElement.classList.toggle("dark", dark);
  11      var metas=document.querySelectorAll('meta[name="theme-color"]');
  12      for (var i=0;i<metas.length;i++) metas[i].setAttribute("content", dark ? dark_c : light);
  13    }catch(e){}
  14  })();`;
  15    return <script dangerouslySetInnerHTML={{ __html: js }} />;
  16  }
```

## Outgoing connections
- call -> lib/theme.ts (web:lib:theme)

## Incoming connections
- layout + error (web:layout) -> call
