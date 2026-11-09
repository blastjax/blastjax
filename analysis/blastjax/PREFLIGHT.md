# Preflight — blastjax

Date: 2026-11-09 · Goal: understand (see `INTENT.md`) · Target stack: none given

**Where the code lives:** the repository root itself (`C:\Users\blastjax\blastjax`). No `legacy/blastjax` link was
made: a junction from inside the repo back to its own root is a directory cycle that recursive walkers (graphify,
ruff, `find`) would loop on. Downstream commands should treat the repo root as `legacy/blastjax`, read-only for the
modernization run.

## Answers

1. **Scope** — Is this code the complete system, or one slice of a larger codebase?
   > Complete system
2. **Build & test locally** — Can this environment restore, build, and run the tests? How long does CI take?
   > Yes, CI ~5-10 min
3. **Bespoke build infrastructure** — Organization-specific build or dependency machinery?
   > None
4. **Prior attempts** — Has anyone tried to modernize this before?
   > No
5. **Off limits** — Is anything not allowed to change in this pass?
   > Nothing

## Check 6 — Scope boundary

Standalone repository: no parent build, no outbound references, no inbound consumers. Note for later passes: the
deploy also installs the shared edge Caddy (`docker/edge/`) that fronts two other sites on the same host
(`portfolio-film`, `icrc`); that is a runtime neighbor, not a code consumer.

## Checks

| # | Check | Status | Found | Fix |
|---|---|---|---|---|
| 1 | Stack | ✅ | Python 3.14 / FastAPI 0.137 / SQLAlchemy 2.1 / psycopg2 (`backend/`, ~73 .py); Next.js 15.5 / React 19.1 / TypeScript 5 / Tailwind 4 (`web/`, ~114 .ts/.tsx); Postgres (Neon) + Redis; Docker Compose, Caddy, GitHub Actions | — |
| 2 | Analysis tooling | ⚠️ | `python` / `py` 3.14.4 (no `python3` alias: Store stub), `ruff` 0.16.6, `node` 25.9, `docker` 29.9, `git`. Missing: `scc`/`cloc`, `lizard` | `winget install BenBoyter.scc` (or `pip install lizard` for complexity); without them assess falls back to file counts. Use `python` wherever a command says `python3` |
| 3a | Build definition | ✅ | `.github/workflows/deploy.yml` "Deploy to Lightsail": `test` (Python 3.14, `pip install -r backend/requirements.txt`, `python backend/test_core.py` against a `postgres:17-alpine` service; Node 20, `npm ci`, `tsc --noEmit`, `npm run lint`) → `build` (GHCR images, registry cache) → `deploy` (SSH to the host, UUID migration + `sync_schema.py`, `compose up --wait`, edge Caddy install). Public PyPI + npm only; nothing bespoke | — |
| 3b | Smoke test | ✅ | L1: `py_compile` of all 73 backend files OK. L2: `backend/test_core.py` 22/22 checks passed in 2 s against a throwaway local Postgres 17 (`TEST_DATABASE_URL`, never Neon); `tsc --noEmit` and `eslint` clean (15 s) | Root `venv/` lacks backend deps (`sqlalchemy` missing); `backend/venv` is the working one |
| 4 | Source completeness | ✅ | Imports resolve (tests import the app; `tsc` clean). Data definitions: `backend/schema.py` (SQLAlchemy models, additive auto-sync on start) + `backend/scripts/` migrations. Config: `docker-compose*.yml`, `docker/Caddyfile`, `docker/edge/`. No binary-only artifacts | — |
| 5 | Optional context | ⚠️ | Git: 271 commits since 2026-04-20. No APM / runtime telemetry connected | Optional: container logs from the host for a runtime overlay |
| 6 | Scope boundary | ✅ | Standalone repo (above) | — |
| 7 | Source edit protection | ⚠️ | No `Edit` deny rule in `.claude/settings.local.json` or user settings; no project `.claude/settings.json` | Only if you want the modernization run to be read-only: `{ "permissions": { "deny": ["Edit(/backend/**)", "Edit(/web/src/**)"] } }` in `.claude/settings.json` (here the source is the live repo, so `Edit(/legacy/**)` would not cover it) |

A permission rule covers Claude's file tools and the shell commands it recognizes, not a script that opens files
itself; the hard guarantee is the OS (read-only mount or sandbox).

Lint notes (not failures): ruff flags `backend/app/factory.py:69` `Any` undefined (annotation only, harmless under
`from __future__ import annotations`), and two bare `try/except/pass` (`backend/cache.py:59`, `backend/db.py:171`).

## Readiness

| Command | Verdict | Why |
|---|---|---|
| `assess`, `map`, `extract-rules` | Ready-with-gaps | Python works; `scc`/`lizard` missing → coarser size and complexity numbers |
| `brief` | Ready | Needs discovery artifacts only |
| `harden` | Ready | `ruff` (bandit `S` rules), `npm audit` available — and INTENT puts it right after `assess` |
| `transform`, `reimagine`, `uplift` | Not applicable yet | Goal is understand; no target stack chosen. Source toolchain is green, so a later dual run is possible |

Most important fix: none red. Optional: install `scc` before `assess`.

Next: `/code-modernization:modernize-assess blastjax`
