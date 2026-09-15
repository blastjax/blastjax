import { BUDGET_THEME_STORAGE_KEY, THEME_COLOR } from "@/lib/theme";

/** Runs before paint so the first frame matches stored / system theme (avoids flash). */
export function ThemeInitScript() {
  const js = `(function(){
  try {
    var k=${JSON.stringify(BUDGET_THEME_STORAGE_KEY)};
    var light=${JSON.stringify(THEME_COLOR.light)}, dark_c=${JSON.stringify(THEME_COLOR.dark)};
    var t=localStorage.getItem(k);
    var dark = t==="dark" || (t!=="light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    var metas=document.querySelectorAll('meta[name="theme-color"]');
    for (var i=0;i<metas.length;i++) metas[i].setAttribute("content", dark ? dark_c : light);
  }catch(e){}
})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
