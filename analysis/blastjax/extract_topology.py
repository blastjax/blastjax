#!/usr/bin/env python
"""Extract blastjax's dependency topology into analysis/blastjax/topology.json.

Run from the repository root:  python analysis/blastjax/extract_topology.py
Read-only over the source. Edges come from three places:
  - Python imports (main -> factory -> routers -> db/services/security/cache).
  - The db.py functions each module imports, resolved to the tables those functions
    insert/update/delete (write) or otherwise reference (read), following db.py's own
    helper calls. That is the code-to-storage join for an ORM codebase.
  - Web imports (@/lib, @/components) and web -> API calls: each lib/api.ts function's
    /api/... paths are matched to the router that serves them, then a page that imports
    the function gets a dispatch edge to that router. Literal /api/ fetches outside
    api.ts (AuthGate, SidebarNav) count too.
"""
from __future__ import annotations

import ast
import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "topology.json"

DOMAINS = {
    "auth": "Auth & Users", "shell": "Shell, Dashboard & Search", "income": "Income",
    "calendar": "Budget Calendar", "monthly": "Monthly Expenses", "bills": "Bills", "debt": "Debt",
    "health": "Health", "travel": "Travel", "lotto": "Lotto", "games": "Games", "infra": "Infra & Data",
    "data": "Data stores", "ext": "External services",
}

# Leaf -> domain. Backend by module stem, web by route dir or file stem.
DOMAIN_OF = {
    # backend
    "auth": "auth", "user": "auth", "security": "auth", "passwords": "auth", "deps": "auth",
    "search": "shell",
    "payslip": "income", "payslip_default": "income", "company": "income", "payslip_parse": "income",
    "fixed_expense": "calendar", "calendar_day_override": "calendar", "pay_period_start_override": "calendar",
    "monthly_expense": "monthly", "bill": "bills", "bill_extract": "bills",
    "credit_card": "debt", "installment": "debt", "house_payment": "debt",
    "installment_service": "debt", "house_payment_service": "debt",
    "blood_pressure": "health", "travel": "travel",
    "lotto": "lotto", "lotto_import": "lotto", "pcso_results": "lotto", "lotto-scraper": "lotto",
    "mosaic": "games", "mambo": "games", "mosaic_solver": "games", "mambo_solver": "games",
    "main": "infra", "factory": "infra", "db": "infra", "schema": "infra", "cache": "infra",
    "health": "infra", "test_core": "infra", "scripts": "infra", "schemas": "infra",
    # web route dirs
    "w:bills": "bills", "w:blood-pressure": "health", "w:calendar": "calendar", "w:commission": "income",
    "w:credit-card": "debt", "w:house-payments": "debt", "w:installments": "debt", "w:lotto": "lotto",
    "w:monthly-expenses": "monthly", "w:payslip": "income", "w:salary-stats": "income",
    "w:settings": "shell", "w:software-architecture": "shell", "w:travels": "travel",
    "w:games/mambo": "games", "w:games/mastermind": "games", "w:games/mosaic": "games", "w:games/sets": "games",
    "w:home": "shell", "w:layout": "shell",
    # web components and lib by stem
    "AuthGate": "auth", "auth.ts": "auth", "CompanyRedirect": "income", "StatsPage": "income",
    "CalendarMonth": "calendar", "payPeriods": "calendar", "ChartZoomControls": "health",
    "chartAxis": "health", "chartTooltipStyle": "health", "useChartZoom": "health",
    "maps": "travel", "remainingPrice": "travel", "api": "infra",
}

EXTERNAL = {"travel": ["ext:google-maps", "ext:nominatim"], "pcso_results": ["ext:pcso"], "lotto-scraper": ["ext:pcso"]}
EXTERNAL_NAMES = {"ext:google-maps": "Google Maps (link resolve)", "ext:nominatim": "Nominatim (reverse geocode)",
                  "ext:pcso": "pcso.gov.ph (lotto results)"}


def tracked() -> list[str]:
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return [p for p in out.splitlines() if p.endswith((".py", ".ts", ".tsx")) and not p.endswith("__init__.py")
            and (p.startswith(("backend/", "web/src/")) or p == "lotto-scraper.py")]


def sloc(path: str) -> int:
    lines = (ROOT / path).read_text(encoding="utf-8", errors="replace").splitlines()
    return sum(1 for ln in lines if ln.strip() and not ln.strip().startswith(("#", "//")))


def leaf_for(path: str) -> tuple[str, str, str, str]:
    """(id, name, domain key, location) for a source path."""
    p = Path(path)
    if path == "lotto-scraper.py":
        return "be:lotto-scraper", "lotto-scraper.py", "lotto", path
    if path.startswith("backend/"):
        if path.startswith("backend/scripts/"):
            return "be:scripts", "scripts/ (migrations)", "infra", "backend/scripts"
        if path.startswith("backend/app/schemas/"):
            return "be:schemas", "schemas/ (Pydantic)", "infra", "backend/app/schemas"
        stem = p.stem
        kind = "router" if "/routers/" in path else "service" if "/services/" in path else "core"
        name = f"{stem}.py" if kind == "core" else f"{kind}s/{stem}.py"
        return f"be:{kind}:{stem}", name, DOMAIN_OF.get(stem, "infra"), path
    # web
    rel = path[len("web/src/"):]
    if rel.startswith("app/"):
        parts = rel.split("/")[1:]
        if len(parts) == 1:
            stem = Path(parts[0]).stem
            if stem == "page":
                return "web:home", "Home page", "shell", path
            return "web:layout", "layout + error", "shell", "web/src/app/layout.tsx"
        route = "/".join(parts[:2]) if parts[0] == "games" else parts[0]
        return f"web:{route}", f"/{route}", DOMAIN_OF.get(f"w:{route}", "shell"), f"web/src/app/{route}"
    stem = p.stem.replace(".check", "")
    key = "auth.ts" if rel == "lib/auth.ts" else stem
    folder = rel.split("/")[0]
    loc_path = f"web/src/{folder}/{stem}{p.suffix}"
    return f"web:{folder}:{stem}", f"{folder}/{stem}{p.suffix}", DOMAIN_OF.get(key, "shell"), loc_path


# ---- schema.py: model class -> table -------------------------------------------------------
def models() -> dict[str, str]:
    tree = ast.parse((ROOT / "backend/schema.py").read_text(encoding="utf-8"))
    out = {}
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            for st in node.body:
                if (isinstance(st, ast.Assign) and any(getattr(t, "id", "") == "__tablename__" for t in st.targets)
                        and isinstance(st.value, ast.Constant)):
                    out[node.name] = st.value.value
    return out


# ---- db.py: function -> (reads, writes) tables, transitively through helpers ----------------
def db_access(model_table: dict[str, str]) -> dict[str, tuple[set[str], set[str]]]:
    source = (ROOT / "backend/db.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    funcs = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
    # Module-level constants that hold models (_SEARCHED, _TRAVEL_CHILDREN): a function using one touches its models.
    consts: dict[str, set[str]] = {}
    for node in tree.body:
        targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, ast.AnnAssign) else []
        value = getattr(node, "value", None)
        for t in targets:
            if isinstance(t, ast.Name) and value is not None:
                held = {model_table[n.id] for n in ast.walk(value) if isinstance(n, ast.Name) and n.id in model_table}
                if held:
                    consts[t.id] = held
    direct: dict[str, tuple[set[str], set[str], set[str]]] = {}
    for name, fn in funcs.items():
        reads, writes, calls = set(), set(), set()
        via_const: set[str] = set()
        writes_variable = False
        for node in ast.walk(fn):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                callee = node.func.id
                if callee in ("insert", "update", "delete") and node.args and isinstance(node.args[0], ast.Name):
                    if node.args[0].id in model_table:
                        writes.add(model_table[node.args[0].id])
                    else:
                        writes_variable = True  # insert(model) where model came from a constant map
                if callee in funcs and callee != name:
                    calls.add(callee)
            if isinstance(node, ast.Name) and node.id in model_table:
                reads.add(model_table[node.id])
            if isinstance(node, ast.Name) and node.id in consts:
                via_const |= consts[node.id]
        reads |= via_const
        if writes_variable:
            writes |= via_const
        # A model constructed (Model(...)) inside a write session is added, so it is a write too.
        src = ast.get_source_segment(source, fn) or ""
        if "write=True" in src:
            for m, t in model_table.items():
                if re.search(rf"\b{m}\(", src):
                    writes.add(t)
        direct[name] = (reads - writes, writes, calls)
    resolved: dict[str, tuple[set[str], set[str]]] = {}

    def walk(name: str, seen: set[str]) -> tuple[set[str], set[str]]:
        if name in resolved:
            return resolved[name]
        r, w, calls = direct[name]
        r, w = set(r), set(w)
        for c in calls:
            if c not in seen:
                cr, cw = walk(c, seen | {name})
                r |= cr
                w |= cw
        resolved[name] = (r - w, w)
        return resolved[name]

    for name in funcs:
        walk(name, set())
    return resolved


def py_imports(path: str) -> tuple[list[str], list[str]]:
    """(imported module paths, names imported from db)."""
    tree = ast.parse((ROOT / path).read_text(encoding="utf-8"))
    mods, db_names = [], []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            mods.append(node.module)
            if node.module == "db":
                db_names += [a.name for a in node.names]
            if node.module in ("app.routers", "app.services", "app"):
                mods += [f"{node.module}.{a.name}" for a in node.names]
        elif isinstance(node, ast.Import):
            mods += [a.name for a in node.names]
    return mods, db_names


def module_to_path(mod: str) -> str | None:
    for cand in (f"backend/{mod.replace('.', '/')}.py", f"backend/{mod.replace('.', '/')}/__init__.py"):
        if (ROOT / cand).exists():
            return cand
    if mod.startswith("app.schemas"):
        return "backend/app/schemas"
    return None


# ---- backend routes: first /api/ segment -> router leaf ---------------------------------------
def route_segments(files: list[str]) -> dict[str, str]:
    seg_to_router = {}
    for path in files:
        if "/routers/" not in path or path.endswith("__init__.py"):
            continue
        text = (ROOT / path).read_text(encoding="utf-8")
        prefix = re.search(r'prefix="([^"]+)"', text)
        for route in re.findall(r'@router\.(?:get|post|put|patch|delete)\("([^"]*)"', text):
            full = (prefix.group(1) if prefix else "") + route
            m = re.match(r"/api/([^/{]+)", full)
            if m:
                seg_to_router.setdefault(m.group(1), leaf_for(path)[0])
    return seg_to_router


def api_functions(seg_to_router: dict[str, str]) -> dict[str, set[str]]:
    text = (ROOT / "web/src/lib/api.ts").read_text(encoding="utf-8")
    starts = [(m.start(), m.group(1)) for m in re.finditer(r"export (?:async )?function (\w+)", text)]
    out = {}
    for i, (pos, name) in enumerate(starts):
        chunk = text[pos: starts[i + 1][0] if i + 1 < len(starts) else len(text)]
        segs = set(re.findall(r"/api/([a-z0-9-]+)", chunk))
        out[name] = {seg_to_router[s] for s in segs if s in seg_to_router}
    return out


def main() -> None:
    files = tracked()
    leaves: dict[str, dict] = {}
    path_leaf = {}
    for path in files:
        lid, name, dom, loc_path = leaf_for(path)
        path_leaf[path] = lid
        leaf = leaves.setdefault(lid, {"id": lid, "name": name, "kind": "module", "dom": dom,
                                       "language": "python" if path.endswith(".py") else "typescript",
                                       "loc": 0, "file": loc_path})
        leaf["loc"] += sloc(path)
    model_table = models()
    access = db_access(model_table)
    for table in sorted(set(model_table.values())):
        leaves[f"ds:{table}"] = {"id": f"ds:{table}", "name": table, "kind": "datastore", "dom": "data"}
    leaves["ds:redis"] = {"id": "ds:redis", "name": "Redis cache", "kind": "datastore", "dom": "data"}
    for eid, ename in EXTERNAL_NAMES.items():
        leaves[eid] = {"id": eid, "name": ename, "kind": "datastore", "dom": "ext"}

    edges: set[tuple[str, str, str]] = set()

    def add(src: str, dst: str, kind: str) -> None:
        if src != dst and src in leaves and dst in leaves:
            edges.add((src, dst, kind))

    # Backend imports and data access.
    for path in files:
        if not path.endswith(".py"):
            continue
        src = path_leaf[path]
        mods, db_names = py_imports(path)
        for mod in mods:
            target = module_to_path(mod)
            if target:
                add(src, path_leaf.get(target, "be:schemas" if target.endswith("schemas") else ""), "call")
        for fn in db_names:
            reads, writes = access.get(fn, (set(), set()))
            for t in reads:
                add(src, f"ds:{t}", "read")
            for t in writes:
                add(src, f"ds:{t}", "write")
        for ext in EXTERNAL.get(Path(path).stem, []):
            add(src, ext, "call")
    add("be:core:cache", "ds:redis", "write")
    add("be:core:cache", "ds:redis", "read")
    # factory includes every router: framework routing is a dispatch edge.
    for lid in leaves:
        if lid.startswith("be:router:"):
            add("be:core:factory", lid, "dispatch")

    # Web imports and web -> API calls.
    seg_to_router = route_segments(files)
    api_fns = api_functions(seg_to_router)
    for path in files:
        if path.endswith(".py"):
            continue
        src = path_leaf[path]
        text = (ROOT / path).read_text(encoding="utf-8")
        for m in re.finditer(r'import\s+(?:type\s+)?\{?([^;]*?)\}?\s+from\s+"@/(lib|components)/([\w.]+)"', text, re.S):
            names, folder, stem = m.group(1), m.group(2), m.group(3)
            add(src, f"web:{folder}:{stem}", "call")
            if folder == "lib" and stem == "api":
                for nm in re.findall(r"\b(\w+)\b", names):
                    for router in api_fns.get(nm, ()):
                        add(src, router, "dispatch")
        if not path.endswith("lib/api.ts"):
            for seg in re.findall(r"/api/([a-z0-9-]+)", text):
                if seg in seg_to_router:
                    add(src, seg_to_router[seg], "dispatch")
    for routers in api_fns.values():
        for router in routers:
            add("web:lib:api", router, "dispatch")

    # Entry points and dead ends.
    pages = [lid for lid, leaf in leaves.items() if lid.startswith("web:") and not lid.startswith(("web:lib", "web:components"))]
    entry = sorted(pages + ["be:core:main", "be:scripts", "be:lotto-scraper", "be:core:test_core"])
    inbound = {d for _, d, _ in edges}
    dead = sorted(lid for lid, leaf in leaves.items()
                  if leaf["kind"] == "module" and lid not in inbound and lid not in entry
                  and not leaf["file"].endswith("__init__.py"))

    # Tree.
    children = defaultdict(list)
    for leaf in sorted(leaves.values(), key=lambda x: x["id"]):
        children[leaf["dom"]].append({k: v for k, v in leaf.items() if k != "dom"})
    root = {"id": "sys", "name": "blastjax", "kind": "system",
            "children": [{"id": f"dom:{k}", "name": v, "kind": "domain", "children": children[k]}
                         for k, v in DOMAINS.items() if children[k]]}

    writers = defaultdict(set)
    for s, d, k in edges:
        if k == "write" and d.startswith("ds:"):
            writers[d].add(s)
    busiest = sorted(writers.items(), key=lambda kv: (-len(kv[1]), kv[0]))[:3]
    topology = {
        "system": "blastjax",
        "root": root,
        "edges": [{"source": s, "target": d, "kind": k} for s, d, k in sorted(edges)],
        "entryPoints": entry,
        "deadEnds": dead,
        "observations": [
            "backend/db.py is the single data-access hub: every router reaches Postgres through it, so the table edges "
            "here are resolved through the db.py functions each module imports (db.py helper calls followed).",
            "Most-written tables: " + "; ".join(f"{d[3:]} ({len(s)} writers)" for d, s in busiest)
            + ". A table with several writers is where cross-domain side effects live.",
            "web/src/lib/payPeriods.ts is client-side business logic: Calendar, Bills, Credit Card, Monthly Expenses and "
            "the home overview share it, and it writes calendar-day overrides back through the API.",
            "Cache invalidation is a hand-kept map in backend/app/factory.py (_CACHE_PREFIXES, _CACHE_ALSO_INVALIDATES): "
            "a write clears other domains' namespaces, which import edges cannot show.",
            "Unresolved by this script: fetch paths built at runtime in the web app (only literal /api/ segments are "
            "matched) and the pypdf/tesseract work in services/bill_extract.py (local processing, not a store).",
            "Dead code found by reading, hidden inside aggregated leaves: web/src/app/payslip/pdfs/PdfBulkUploadClient.tsx "
            "(imported by nothing) and lotto-scraper.py (standalone CLI duplicating services/pcso_results.py).",
        ],
        "flows": FLOWS,
    }
    OUT.write_text(json.dumps(topology, indent=1), encoding="utf-8")

    by_kind = defaultdict(int)
    for _, _, k in edges:
        by_kind[k] += 1
    print(f"leaves: {len(leaves)} ({sum(1 for x in leaves.values() if x['kind'] == 'module')} modules, "
          f"{sum(1 for x in leaves.values() if x['kind'] == 'datastore')} stores/external)")
    print("edges:", len(edges), dict(by_kind))
    print("entry points:", len(entry), "| dead-end candidates:", dead or "none")
    print("route segments matched to routers:", len(seg_to_router), "|",
          sum(1 for v in api_fns.values() if v), "of", len(api_fns), "api.ts functions resolved to a router")
    for d, s in busiest:
        print(f"  {d}: written by {sorted(s)}")
    flow_ids = {n for f in FLOWS for st in f["steps"] for n in st["nodes"]}
    missing = sorted(flow_ids - set(leaves))
    print("flow nodes missing from the tree:", missing or "none")
    print("wrote", OUT.relative_to(ROOT))


FLOWS = [
    {"name": "Record a credit-card payment", "persona": "You, running the household budget",
     "description": "You mark a card statement paid and the payment lands on the budget calendar.",
     "steps": [
         {"label": "Open Credit Cards and record the payment", "nodes": ["web:credit-card", "web:lib:api"]},
         {"label": "The API saves the payment", "nodes": ["be:router:credit_card", "be:core:db"]},
         {"label": "The payment also becomes a fixed expense on its day", "nodes": ["ds:fixed_expense"]},
         {"label": "The page re-spreads the pay-period budget", "nodes": ["web:lib:payPeriods", "be:router:calendar_day_override"]},
         {"label": "The calendar shows the new daily amounts", "nodes": ["ds:calendar_day_override", "web:calendar"]},
     ]},
    {"name": "Add a bill from a photo", "persona": "You, paying the monthly bills",
     "description": "You upload a photo or PDF of a bill and the amount and due date are read for you.",
     "steps": [
         {"label": "Upload the bill on the Bills page", "nodes": ["web:bills", "web:lib:api"]},
         {"label": "The API checks the file type and size", "nodes": ["be:router:bill", "be:core:deps"]},
         {"label": "Text is read from the PDF or photo", "nodes": ["be:service:bill_extract"]},
         {"label": "The bill is saved", "nodes": ["be:core:db", "ds:bill"]},
         {"label": "Linked card and monthly-expense views refresh", "nodes": ["be:core:factory", "ds:redis"]},
     ]},
    {"name": "Import a payslip", "persona": "You, tracking salary",
     "description": "You add a payslip PDF and it feeds salary stats and the budget.",
     "steps": [
         {"label": "Upload the payslip", "nodes": ["web:payslip", "web:lib:api"]},
         {"label": "The API parses the PDF", "nodes": ["be:router:payslip", "be:service:payslip_parse"]},
         {"label": "The payslip is stored with its company", "nodes": ["be:core:db", "ds:payslip"]},
         {"label": "Salary stats and the calendar read it", "nodes": ["web:salary-stats", "web:calendar"]},
     ]},
    {"name": "Log in", "persona": "Anyone using the app once users exist",
     "description": "You sign in with a password or passkey and every page opens behind the session gate.",
     "steps": [
         {"label": "The app checks whether a login is needed", "nodes": ["web:components:AuthGate", "be:router:auth"]},
         {"label": "Password or passkey is verified", "nodes": ["be:core:security", "be:core:passwords"]},
         {"label": "A session token is issued and stored hashed", "nodes": ["ds:app_user_session", "ds:redis"]},
         {"label": "Every API call is checked against the session", "nodes": ["be:core:deps", "be:core:factory"]},
     ]},
]

if __name__ == "__main__":
    main()
