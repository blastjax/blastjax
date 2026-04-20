import { BUDGET_THEME_STORAGE_KEY } from "@/lib/theme";

/** Runs before paint so the first frame matches stored / system theme (avoids flash). */
export function ThemeInitScript() {
  const js = `(function(){
  try {
    var k=${JSON.stringify(BUDGET_THEME_STORAGE_KEY)};
    var t=localStorage.getItem(k);
    var d=document.documentElement;
    if(t==="dark"){d.classList.add("dark");}
    else if(t==="light"){d.classList.remove("dark");}
    else if(window.matchMedia("(prefers-color-scheme: dark)").matches){d.classList.add("dark");}
  }catch(e){}
})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
