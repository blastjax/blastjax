# blastjax

Personal dashboard app for household money and a few extras: payslips with salary and commission stats, a budget calendar, monthly and fixed expenses, credit cards, installments, house payments and bills (text is read from uploaded PDFs and photos), plus blood-pressure tracking, travel plans, lotto results, a handful of small games, and a search box across all of it. The **API reads from a cloud PostgreSQL database** (Neon, via `DATABASE_URL`); payslips can be bulk-imported from nested JSON (`POST /api/payslip/import-json`).

## Stack

- **Backend:** Python, FastAPI, Uvicorn, SQLAlchemy (`backend/`)
- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind 4 (`web/`)
- **Data:** PostgreSQL (Neon) — required, set `DATABASE_URL` in `.env` (see `.env.example`)
- **Cache:** Redis (optional; speeds up repeated reads, defaults to `localhost:6379` / the `redis` compose service)

## Architecture

The browser talks only to Caddy, which sends `/api/*` to the FastAPI app and everything else to the Next.js server. Every API route except `/api/auth` and `/api/health` sits behind a session gate (opt-in, see [Configuration](#configuration)). Routers read through Redis to Neon Postgres; the travel and lotto routers also call Google Maps / Nominatim and pcso.gov.ph.

The full picture is an interactive diagram under **Software Architecture** in the app's sidebar (`/software-architecture`), served from [`web/public/software-architecture.html`](web/public/software-architecture.html). Archify renders it from a `candidate.json` under `.archify/`, and every box cites the source lines it describes. Regenerate it after a structural change (a new router, service or deploy step) and copy the new HTML over the public file.

## Prerequisites

- Python 3.14 (what CI and the Docker image use)
- Node.js 20+ and npm
- Optional: [Tesseract](https://github.com/tesseract-ocr/tesseract) on `PATH`, only for reading bills uploaded as photos (the Docker image includes it)

## Setup

1. **Clone** this repository and enter the project root.

2. **Python virtual environment** (from project root):

   ```bash
   python -m venv venv
   ```

   Activate it, then install backend dependencies:

   - **Windows (Git Bash / PowerShell):** `source venv/Scripts/activate` or `venv\Scripts\activate`
   - **macOS / Linux:** `source venv/bin/activate`

   ```bash
   pip install -r backend/requirements.txt
   ```

3. **Environment file** (required — the API will not start without a `DATABASE_URL`)

   ```bash
   cp .env.example .env
   ```

   Set `DATABASE_URL` to your Neon Postgres connection string, using the *pooled* endpoint (the host containing `-pooler`). [`backend/schema.py`](backend/schema.py) defines the schema as SQLAlchemy models, and every API start adds any table or column it defines that the database lacks, so a new column needs no script. That's additive only: renames, type changes and drops are Alembic migrations in `backend/migrations/` (`cd backend && alembic revision -m "..."`, then `alembic upgrade head`); the deploy runs them right after the schema sync.

4. **Frontend dependencies**

   ```bash
   cd web && npm install && cd ..
   ```

## Run locally

The UI expects the API at **`http://127.0.0.1:8000`** unless you set `NEXT_PUBLIC_API_URL` for the Next.js app. Run both in two terminals:

1. Backend (from `backend/`):

   ```bash
   cd backend
   python -m uvicorn main:app --reload --port 8000
   ```

2. Frontend (from `web/`):

   ```bash
   cd web
   npm run dev
   ```

Then open the URL Next.js prints (usually `http://localhost:3000`).

## Checks

CI runs these before every deploy; run them the same way locally:

```bash
python backend/test_core.py                  # backend checks
cd web && npx tsc --noEmit && npm run lint   # web typecheck + lint
```

The backend's database check runs only when `TEST_DATABASE_URL` points at a Postgres where it may create and drop a `blastjax_test` schema. Use a throwaway local one, never Neon:

```bash
docker run -d --rm --name blastjax-test-pg -p 55432:5432 -e POSTGRES_PASSWORD=test postgres:17-alpine
TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/postgres python backend/test_core.py
docker stop blastjax-test-pg
```

## Docker

`docker-compose.yml` is tuned for the production deploy: **Caddy** is the sole public entry point (ports **80**/**443**, auto-HTTPS), and the `api`/`web` containers publish no host ports of their own. For a local run, `docker-compose.override.yml` is auto-merged in and adds direct host ports for `web` (**3000**) and `api` (**8000**) so you don't need Caddy or a domain — just run `docker compose up --build` from the repo root. The override also sets `BUDGET_DISABLE_AUTH=1`, so a local Docker run never asks for a login. The API container reads and writes the same Neon database as local runs, so `DATABASE_URL` must be set for it too. See [`docker/README.md`](docker/README.md) for commands and environment variables.

## Configuration

Login is opt-in and needs no environment variable: the app is open until you add at least one user under **Settings → Users** in the web app, after which every screen requires that username/password to log in (passwords are hashed with Argon2id). A login lasts on that browser until you log out, and survives API restarts and deploys.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | **Required**; the Neon Postgres URL the API reads and writes (see `.env.example`). Use the *pooled* endpoint — the host containing `-pooler`. |
| `NEXT_PUBLIC_API_URL` | Optional; override API base URL for the web app (default `http://127.0.0.1:8000`). Omit or leave blank to keep the default. |
| `NEXT_PUBLIC_BASE_PATH` | Optional; set at **build** time with `STATIC_EXPORT=1` when the app is served under a subpath. |
| `BUDGET_CORS_ORIGINS` | Optional; comma-separated extra browser origins allowed by the API. |
| `REDIS_URL` | Optional; Redis connection string for the API's cache. Defaults to `redis://localhost:6379` for a bare `uvicorn` run, `redis://redis:6379` for the `api` container. |
| `REDIS_CACHE_TTL` | Optional; cache entry lifetime in seconds. Defaults to 86400 (a day). A backstop only — every write invalidates the namespaces it affects, so lowering this doesn't make the app fresher, it just sends more reads to Neon. |
| `BUDGET_DB_POOL_KEEP` | Optional; Postgres connections kept pooled between requests. Defaults to 6, sized to a page load's fan-out so repeat visits don't pay for fresh TLS handshakes. |
| `BUDGET_DB_POOL_MAX` | Optional; ceiling on concurrent Postgres connections. Defaults to 10. |
| `BUDGET_DB_PROBE_AFTER_SECONDS` | Optional; how long a pooled connection may sit idle before a checkout spends a `SELECT 1` liveness check on it. Defaults to 20. |
| `BUDGET_DB_IDLE_CLOSE_SECONDS` | Optional; after this many seconds with no queries the whole pool is closed, so an idle API holds no Neon connections. Defaults to 120. |
| `BUDGET_DISABLE_AUTH` | Optional; `1` turns the login off even when users exist. Set only by `docker-compose.override.yml` for local Docker runs — never set it in production. |
| `TEST_DATABASE_URL` | Optional; a throwaway Postgres for the database check in `backend/test_core.py` (see [Checks](#checks)). |
| `API_UID` / `API_GID` | Optional; uid:gid the api container runs as (default `1000:1000`). Only needed if the bind-mounted `data/` directory is owned by another user. |

> **Note:** `.env` is loaded with `override=True`, so values in the file win over variables already exported in the environment. Change the file, not the shell, when a setting doesn't seem to take effect.

## Deploying to Lightsail

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on every push to `main` (or manual dispatch), in three jobs:

1. **test** — `python backend/test_core.py` against a throwaway Postgres 17 service, then `npx tsc --noEmit` and `npm run lint` in `web/`. A failure stops the run before anything is built.
2. **build** — builds the API and web images on GitHub-hosted runners and pushes them to GHCR.
3. **deploy** — connects to the AWS Lightsail instance over **SSH** as `ubuntu` and runs a script there: `git pull --ff-only`, pull the new images, run the one-time integer-to-UUID id migration and `scripts/sync_schema.py` (a failure here stops the deploy with the old API still running), flush Redis, then `docker compose up --wait`. The job fails unless `redis`, `api` and `web` report **healthy** and the edge proxy can reach both, so a red run means "not deployed" rather than "deployed and broken". Deploys are serialized via a `concurrency` group.

The instance also hosts the `portfolio-film` and `icrc` sites. All three sit behind one shared Caddy (the **edge proxy**), which this repo owns and this deploy installs and starts. See [`docker/edge/README.md`](docker/edge/README.md) for how the sites plug into it and for the one-time steps that moved the other two sites onto this host.

One-time setup on the instance:
1. Clone this repo at the path you'll use below, point the domain in [`docker/Caddyfile`](docker/Caddyfile) at the instance, and create `.env` (see `.env.example`) if you need to override any defaults — `NEXT_PUBLIC_API_URL` is normally left unset so the built-in web image build arg (`http://127.0.0.1:8000`) is overridden instead by `secrets.NEXT_PUBLIC_API_URL` at build time in CI, set to the site's own public URL (see "Before exposing this publicly" below).
2. Install Docker + the Compose plugin, and run `docker compose up -d` once by hand to confirm it works.
3. Add the public half of a deploy key to `~ubuntu/.ssh/authorized_keys`; the private half goes in the `DEPLOY_SSH_KEY` secret.
4. `ubuntu` needs passwordless `sudo` for `chown -R 1000:1000 data` and for creating `/srv/edge`, where the edge proxy's files live. The chown matters because the api container runs unprivileged as uid 1000 and the `data/` bind mount keeps host ownership — a directory left behind by an older root-run container would otherwise be unwritable.

### Before exposing this publicly

- **TLS is already terminated by Caddy**: the shared edge proxy on the instance, running the site block in `docker/Caddyfile`. It auto-provisions and renews a Let's Encrypt cert for the domain configured there and proxies `/api/*` to the `api` service, everything else to `web` — a domain name pointed at the instance is the only prerequisite. `api` and `web` publish no host ports of their own in `docker-compose.yml`, so they're only reachable through Caddy.
- **Restrict the instance firewall** to ports 80/443, plus 22 for the deploy's SSH — Redis is published loopback-only and the API/web containers aren't exposed directly.
- Because the API is proxied under the same origin as the web app, set `NEXT_PUBLIC_API_URL` to the site's own URL (e.g. `https://blastjax.example.com`) — this avoids CORS entirely.

Repository secrets (**Settings → Secrets and variables → Actions → Secrets**); no repository variables are needed:

| Secret | Purpose |
|--------|---------|
| `APP_DIR` | Absolute path to the cloned repo on the instance, e.g. `/home/ubuntu/blastjax`. |
| `DEPLOY_HOST` | Hostname or IP of the instance the deploy SSHes into. |
| `DEPLOY_SSH_KEY` | Private key for `ubuntu@DEPLOY_HOST` (see one-time setup). |
| `DATABASE_URL` | The Neon Postgres URL (pooled endpoint) the api container uses. |
| `BUDGET_CORS_ORIGINS` | Optional; comma-separated extra browser origins allowed by the API (see below). |
| `NEXT_PUBLIC_API_URL` | Build-time API base URL baked into the web image; must be reachable from visitors, not just the instance. |

## Project layout

| Path | Contents |
|------|----------|
| `backend/` | FastAPI app (`app/routers`, `app/services`), DB layer (`db.py`, `schema.py`), Redis cache (`cache.py`), checks (`test_core.py`) |
| `backend/migrations/` | Alembic migrations: what the additive schema sync can't do (renames, type changes) |
| `backend/scripts/` | The one-time UUID id migration, the schema sync, the OpenAPI export and a bill-reading accuracy check |
| `web/` | Next.js app (calendar, expenses, cards, bills, payslips, health, travels, games, lotto, settings, …) |
| `docker/` | Dockerfiles, Caddyfile, the shared edge proxy (`docker/edge/`), docker docs |
| `.archify/` | Sources for the Software Architecture diagram |
| `analysis/` | Modernization notes (intent, preflight) |
| `lotto-scraper.py` | Standalone PCSO results scraper CLI; not used by the app, whose lotto sync lives in `backend/app/services/pcso_results.py` |

## License

[MIT](LICENSE)
