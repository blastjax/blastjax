# Assessment — blastjax

Date: 2026-11-09 · Source: repository root at `d5d57f5` (read-only) · Goal: understand (see `INTENT.md`)

## Executive Summary

blastjax is a personal finance-and-lifestyle dashboard: a FastAPI backend and a Next.js front end over a Neon Postgres
database, about 37.8 KSLOC in 200 source files (62% of it React/TSX). The stack is current (Python 3.14, FastAPI 0.137,
SQLAlchemy 2.1, Next.js 15.5, React 19) and the code builds and passes its own checks, so nothing argues for a rewrite.
The risk is concentrated in security, not structure: authorization exists only in the browser (any logged-in user can
make themselves admin through the API), the deployed Next.js version carries a critical advisory, and local runs write
to the production database with login turned off. **Recommendation: Refactor in place** — harden first, a small
same-stack uplift (Next.js ≥ 15.5.29, Node 22/24 LTS), then break up the three largest files.

## System Inventory

Counted with `find` + `wc` (no `scc`/`cloc` installed): non-blank, non-comment lines of tracked source, excluding
generated files (`.archify/`, `web/public/software-architecture.html`, `package-lock.json`).

| Language | Files | SLOC |
|---|---|---|
| TypeScript React (`.tsx`) | 85 | 23,294 |
| Python (`.py`) | 74 | 9,647 |
| TypeScript (`.ts`) | 29 | 4,070 |
| CSS | 1 | 422 |
| YAML (compose, CI) | 4 | 258 |
| Config (Dockerfiles, Caddyfiles, `edge-install`) | 5 | 92 |
| JS modules (`.mjs`) | 2 | 25 |
| **Total** | **200** | **37,808** |

Complexity (decision keywords `if/elif/for/while/case/catch/except/&&/||`): 3,664 decision points, **99 per KSLOC**.
Most decision points per file:

| File | Decision points | SLOC |
|---|---|---|
| `web/src/app/calendar/CalendarClient.tsx` | 192 | 2,145 |
| `backend/db.py` | 191 | 1,681 |
| `backend/app/services/mambo_solver.py` | 180 | 650 |
| `web/src/app/lotto/LottoClient.tsx` | 172 | 2,221 |
| `web/src/app/installments/InstallmentsClient.tsx` | 172 | 1,285 |
| `web/src/app/travels/TravelsClient.tsx` | 150 | 1,291 |
| `backend/app/services/bill_extract.py` | 135 | 425 |
| `lotto-scraper.py` | 112 | 406 |

### Technology fingerprint

- **Backend** — Python 3.14 (`docker/Dockerfile.backend:1`, CI `deploy.yml`), FastAPI 0.137 + Uvicorn 0.49,
  SQLAlchemy 2.1 + psycopg2, Pydantic schemas, Argon2 (`argon2-cffi`), WebAuthn passkeys (`webauthn`), `curl_cffi` +
  BeautifulSoup scraping, `pypdf` + Pillow + a `tesseract` subprocess for bill text. Manifest: `backend/requirements.txt`
  (compatible-release pins).
- **Frontend** — Next.js 15.5.14 (standalone output), React 19.1, TypeScript 5, Tailwind 4, Recharts 3. Manifest:
  `web/package.json` + lockfile.
- **Data stores** — Neon Postgres (SQLAlchemy models in `backend/schema.py`, additive auto-sync on every start,
  one-off scripts in `backend/scripts/`); Redis 7 read-through cache with per-route namespaces (`backend/app/factory.py:30-54`).
  Files (payslip and bill PDFs/photos) are stored as database blobs.
- **Integration points** — 127 REST routes under `/api/*`; outbound to Google Maps / Nominatim (`routers/travel.py`) and
  pcso.gov.ph (`services/pcso_results.py`). No queues or batch jobs.
- **Runtime / deploy** — Docker Compose (redis, api, web) behind a shared edge Caddy on an AWS Lightsail host; GitHub
  Actions test → build (GHCR) → SSH deploy.
- **Tests** — `backend/test_core.py`: 22 assert-based checks incl. one against a real Postgres, run in CI before every
  build. Web: `tsc --noEmit` + ESLint in CI; one check file (`web/src/lib/remainingPrice.check.ts`) that CI does not
  run. No coverage tooling; the budget logic in `web/src/lib/payPeriods.ts` and the large page components have no tests.

## Architecture at a Glance

Twelve domains; diagram in [`ARCHITECTURE.mmd`](ARCHITECTURE.mmd). The runtime view (proxy, gate, stores, outbound
calls, each box cited to source) is the app's **Software Architecture** page, `web/public/software-architecture.html`.

| Domain | What it does | Key files | Couples to |
|---|---|---|---|
| Auth & Users | Password + passkey login, sessions, user admin | `routers/auth.py`, `routers/user.py`, `security.py`, `deps.py`; `AuthGate.tsx`, `lib/auth.ts` | Infra (imports `factory.cors_allow_origins`) |
| Shell, Dashboard & Search | Layout, nav, home overview, global search, UI kit | `routers/search.py`; `layout.tsx`, `Header.tsx`, `HomeOverview.tsx`, `FinanceUI.tsx`, `lib/nav.ts` | Reads nearly every finance domain |
| Income | Payslips (PDF parse, JSON import), companies, salary/commission stats | `routers/payslip.py`, `company.py`, `payslip_default.py`, `services/payslip_parse.py` | Bills (`bill_extract.pdf_text`) |
| Budget Calendar | Pay-period budgets, fixed expenses, pinned days | `routers/fixed_expense.py`, `calendar_day_override.py`, `pay_period_start_override.py`; `CalendarClient.tsx`, `lib/payPeriods.ts` | Income, Monthly, Bills, Debt, Travel |
| Monthly Expenses | Recurring expenses linked to bill categories and house payments | `routers/monthly_expense.py`; `MonthlyExpensesClient.tsx` | Bills, Debt (FKs), Calendar |
| Bills | Bill categories, bills, text extraction | `routers/bill.py`, `services/bill_extract.py`; `BillsClient.tsx` | Monthly, Calendar |
| Debt | Credit cards, installments, house payments | `routers/credit_card.py`, `installment.py`, `house_payment.py` + services | Bills (latest bill), Calendar (writes `fixed_expense`) |
| Health | Blood-pressure readings and charts | `routers/blood_pressure.py`; `blood-pressure/*` | — |
| Travel | Trips, flights, transport, itinerary, stays | `routers/travel.py`; `TravelsClient.tsx`, `lib/maps.ts` | Google Maps, Nominatim |
| Lotto | PCSO result sync, imports, tickets | `routers/lotto.py`, `services/pcso_results.py`, `lotto_import.py`; `LottoClient.tsx` | pcso.gov.ph |
| Games | Mosaic/Mambo server solvers; Mastermind/Sets client-only | `routers/mosaic.py`, `mambo.py` + solvers; `games/*` | Auth only, no database |
| Infra & Data | App factory, cache invalidation, DB pool, schema sync, deploy | `factory.py`, `db.py`, `schema.py`, `cache.py`, `docker/`, `deploy.yml` | — |

Cross-domain facts worth knowing: a credit-card payment writes a `fixed_expense` row (`db.py:1235-1239`); writes in one
domain clear other domains' cache namespaces through a hand-kept map (`factory.py:47-54`); every web call in
`lib/api.ts` matches a backend route and method. Backend routes with no web caller: `GET /api/auth/config`,
`GET /api/payslip/{id}`, `PUT /api/installment/{id}/line/{seq}` (and `POST /api/payslip/import-json`, a documented
direct-API feature).

## Production Runtime Profile

No telemetry available (no APM connected, no runtime exports supplied). Container logs from the Lightsail host would
allow per-route latency later.

## Technical Debt

| # | Debt | Location | Why it matters | Remediation | Effort |
|---|---|---|---|---|---|
| 1 | Local runs write to production with login off | `backend/db.py:61-67` (`.env` loaded with `override=True`); `docker-compose.override.yml` (`BUDGET_DISABLE_AUTH: "1"`) | A local Docker run is an unauthenticated API with full write access to production data; shell variables cannot override it | Drop `override=True`, give local work a Neon dev branch, refuse to disable auth against a production URL | S |
| 2 | Company stored as free text | `backend/schema.py:354,406,414` (string, hardcoded default "Sophos"); `db.py:1913-1921` | Renaming a company leaves its payslips and defaults under the old name; delete is guarded by name only (`db.py:1929`) | Add `company_id` FK, backfill, drop the text column and default | M |
| 3 | `db.py` god module | `backend/db.py` (2,056 lines, 173 functions; `_session` is the graph's top hub) | Every feature touches it; update/delete functions are near-copies; read sessions flip driver autocommit behind SQLAlchemy (`db.py:200-206`) | Split per domain, shared `_update`/`_delete` helpers, use SQLAlchemy's AUTOCOMMIT isolation | L |
| 4 | Untyped API contract, hand-copied client | No `response_model` on any route; `web/src/lib/api.ts` (1,555 SLOC, 75 hand-written types, 120 wrappers) | Backend/front-end drift is caught by nothing in CI | Declare response models, generate TS types from OpenAPI | L |
| 5 | Very large page components | `CalendarClient.tsx` (one component spans lines 375-1906, 41 `useState`), `LottoClient.tsx`, `TravelsClient.tsx`, `InstallmentsClient.tsx`, `CreditCardClient.tsx` | Hard to change or test; `lotto/page.tsx:20` imports UI from `./LottoClient` | Extract data hooks and subcomponents; move shared pieces to `components/` | L |
| 6 | Router boilerplate, part of it dead | No-op `_serialize` helpers in 11 routers/services (dates already serialized by `db._row`, `db.py:213-228`); 4 copies of a trim helper; 40 hand-written cache get/set calls; 13 copies of the duplicate-key → 409 handler | Hundreds of lines that look meaningful but aren't | Delete `_serialize`; one cache decorator; one app-wide `IntegrityError` handler | S |
| 7 | Hand-kept cache invalidation map | `backend/app/factory.py:30-54`; failures logged at debug level (`cache.py:112-113`) | A new router or relation that is not registered serves stale data for up to 24 h (TTL) with no warning | Derive namespaces from router prefixes; log invalidation failures as warnings; test the map in `test_core.py` | M |
| 8 | Front-end error handling copy-pasted, some failures hidden | `e instanceof Error ? …` ×98; `MonthlyExpensesClient.tsx:155-161` swaps failed loads for empty lists and fetches house payments one by one | Totals can be wrong with no warning shown | One `errorMessage(e)` helper and a `useLoad` hook; warn on partial loads; bulk endpoint | M |
| 9 | Retirable one-off migrations | Ten `backend/scripts/add_*.py` (~700 lines, stale docstrings); `migrate_ids_to_uuid.py` runs as a no-op on every deploy (`deploy.yml:119`) | Dead paths that look like the official migration process | Delete the `add_*` scripts; once production is confirmed on UUIDs, drop the deploy step and the `pre_uuid_ids` backup schema; adopt Alembic at the first rename | S |
| 10 | Dead code and stale config | `lotto-scraper.py` (duplicates `pcso_results.py`); `app/payslip/pdfs/PdfBulkUploadClient.tsx` (imported by nothing); unused `BUDGET_JWT_SECRET`; `./data` volume no code reads; `BUDGET_SESSION_TTL_SECONDS` documented (`docker/README.md:15`) but never read; `DATABASE_URL_UNPOOLED` read (`db.py:76`) but undocumented; "EC2" wording in `docker/README.md`, `docker-compose.override.yml` | Misleads operators and newcomers | Delete or document each | S |

Also noted: `bill_extract.py:28-38` patches an internal pypdf table at import time (a pypdf upgrade could silently
misread amounts); ruff reports 112 issues, mostly style (one undefined `Any` in an annotation at `factory.py:69`).
Deprecated APIs barely apply: one deprecated React 19 type (`MutableRefObject`, `PayslipClientModal.tsx:9,85`) and the
legacy ESLint `FlatCompat` shim.

## Security Findings

Credential inventory in `SECRETS.local.md` (gitignored; not for sharing). No secret has ever been committed to git.
Python dependencies were **not** audited (`pip-audit` not installed). Findings #1–#5 and #8 were re-checked against
the code for this report.

| # | CWE | Severity | Finding | Location | Fix |
|---|---|---|---|---|---|
| 1 | 1395 | Critical | Next.js 15.5.14 has a critical advisory (npm audit: 1 critical, 6 high, 9 moderate; fix in 15.5.29). The public site exposes `/_next/image` | `web/package.json` | Upgrade Next.js ≥ 15.5.29, `npm audit fix` |
| 2 | 862 | High | `is_superuser` / `allowed_pages` are enforced only in the browser: any logged-in user can create, delete or re-permission users, reset passwords, and read any page's data through the API | `backend/app/routers/user.py:37-78`; `deps.py:17-23`; `AuthGate.tsx:74` | `require_superuser` on `/api/users`; per-router page checks server-side |
| 3 | 1188 / 306 | High | Auth fails open: while no user exists the whole API is open and the first `POST /api/users` owns it; deleting the last user (possible via #2) reopens everything | `security.py:80-94`; `deps.py:17-19` | Create the first admin via CLI or one-time token; block deleting the last superuser |
| 4 | 918 | Medium | SSRF: only the first Maps URL is checked; `urllib` follows redirects to any host, including internal addresses, and returns page text to the caller | `routers/travel.py:69-81` | Disable redirects; follow ≤ 3 hops manually, re-checking https, allowlist and non-private IP |
| 5 | 307 / 400 | Medium | Login throttling keys on `request.client.host`, which is always the proxy (uvicorn does not trust Caddy's forwarded header): 8 bad logins from anyone lock out every user | `routers/auth.py:63-64,96`; `Dockerfile.backend:28` | `--forwarded-allow-ips=<edge network>`; throttle per (IP, username) |
| 6 | 613 | Medium | Sessions never expire; a password change does not revoke sessions; a deleted session stays valid from Redis for up to 5 min | `security.py:107-126`; `user.py:53-63` | `expires_at` + idle timeout; revoke on password change and user delete |
| 7 | 400 | Medium | Image resize bomb: a 1×60000 PNG passes Pillow's pixel check, then is resized to an enormous canvas and exhausts memory | `services/bill_extract.py:143-145` | Reject extreme aspect ratios/pixel counts before resizing |
| 8 | 319 | Medium | The Caddy site also answers on a bare public IP over plain HTTP: passwords and bearer tokens can travel unencrypted; no HSTS | `docker/Caddyfile:1` | Drop the IP site or redirect it to HTTPS; add HSTS |
| 9 | 307 | Medium | `/api/users/verify` lets any session holder test passwords with no rate limit | `user.py:46-50` | Remove, or superuser-only and throttled |
| 10 | 1104 | Medium | Node 20 is end-of-life (web image and CI) | `Dockerfile.web:1,18`; `deploy.yml:36` | Node 22/24 LTS; pin images by digest |
| 11 | 377 / 78 | Low | Deploy writes `DATABASE_URL` and `GITHUB_TOKEN` into `/tmp` scripts with default permissions; a `'` in a secret breaks quoting; `ref_name` is pasted into the shell | `deploy.yml:95-140` | `umask 077`, pass values as env, pipe the script over `ssh 'bash -s'` |
| 12 | 295 | Low | `ssh-keyscan` trusts whatever host key it sees on every deploy | `deploy.yml:91` | Pin `known_hosts` in a secret |
| 13 | 922 / 1021 | Low | Token in localStorage, never expires; no CSP, nosniff or frame-ancestors headers | `web/src/lib/auth.ts:17`; `docker/Caddyfile` | HttpOnly SameSite cookie, or at least a strict CSP and security headers |
| 14 | 434 / 770 | Low | Uploads accept a PDF by client Content-Type alone; the whole body is read before the 10 MB check; no Caddy body limit | `deps.py:32-40`; `bill.py:145-150` | Require magic bytes; stream with a limit; Caddy `request_body max_size` |
| 15 | 306 | Low | Redis has no password yet holds auth state (`users_exist`, sessions) | `security.py:88-91,120-122`; `docker-compose.yml:2-6` | `requirepass`/ACL; don't trust a cached "no users" |
| 16 | 346 / 362 | Low | Passkey RP ID comes from the request's Origin/Host; taking a challenge is not atomic | `auth.py:75-81`; `security.py:164-167` | Pin RP ID and origin in config; `GETDEL` |
| 17 | 601 | Low | Map URLs stored unvalidated and rendered as links | `schemas/travel.py`; `lib/maps.ts:10` | Accept only https Google-host links |
| 18 | 208 | Low | Login skips Argon2 for unknown usernames (timing reveals which exist) | `auth.py:99-100` | Verify against a dummy hash |
| 19 | 250 / 532 | Low | App connects as the Neon owner role and runs DDL at start; Redis URL logged in full | `schema.py:674`; `cache.py:48,50` | Separate migration and app roles; log host only |
| 20 | — | Info | `allow_credentials=True` is unneeded with bearer auth; localhost origins always allowed in production; `backend/.dockerignore` misses `venv/`; GitHub Actions not SHA-pinned | `factory.py:19-27,103` | Tighten CORS; pin actions |

Checks that came back clean: SQL injection (ORM throughout, search uses `icontains(autoescape=True)` with a length cap),
command injection (tesseract via argv, no shell), path traversal (files are DB blobs keyed by UUID), deserialization
(Redis holds JSON), password hashing (Argon2) and token generation (`secrets.token_urlsafe`, stored as SHA-256), fixed
outbound URLs for PCSO and Nominatim, non-root containers, Redis and API not publicly exposed, production deploy never
loads the auth-disabling override.

## Documentation Gaps

1. **The budget logic runs in the browser.** `web/src/lib/payPeriods.ts` computes pay-period budgets and writes
   calendar-day overrides back to the API (`spreadBudgetChanges`); pinned days decide whether a change moves daily
   amounts. Nothing explains this model or that the server stores only its results.
2. **The cache namespace map.** A new router or cross-domain relation must be registered in `factory.py:30-54` or it
   serves stale data for up to a day. Not mentioned anywhere outside the code.
3. **Cross-domain writes and links.** Card payments create fixed expenses; monthly expenses link to bill categories and
   house payments; companies are joined by name. A newcomer changing one domain cannot see what else moves.
4. **What `is_superuser` and `allowed_pages` actually protect.** The README says login protects every screen; nothing
   says that page permissions are a UI convenience only (security finding #2).
5. **The data and migration lifecycle.** The README covers the additive schema sync, but not that the `add_*` scripts are
   obsolete, that the UUID migration still runs on every deploy, or where the `pre_uuid_ids` backup lives; env vars
   drift (`DATABASE_URL_UNPOOLED` undocumented, `BUDGET_SESSION_TTL_SECONDS` documented but dead).

## Relative Scale

Index **159.8** (`2.94 × KSLOC^1.10`, KSLOC 37.8). This is a relative size measure for ranking this system against
others. It is not a timeline or a cost.

## Recommended Modernization Pattern

**Refactor** (in place, same stack). The technology is already current, the code builds and its checks pass, the
domains are clear, and every web call matches a backend route, so Rehost, Replatform, Rearchitect, Rebuild and Replace
would each spend effort without removing a real risk. What needs work is inside the existing stack: server-side
authorization and the other security findings, two version moves (Next.js ≥ 15.5.29, Node 22/24 LTS), and splitting
the three god files (`db.py`, `lib/api.ts`, the largest page components) behind a typed API contract. Routing: your
intent puts security first, so `harden` comes next; the version moves go through `uplift` ("a move to a newer version
of the same technology"); the structural refactors are ordinary in-place changes guarded by `test_core.py`, `tsc` and
the characterization tests `extract-rules` can produce. Neither `transform` nor `reimagine` is warranted.
