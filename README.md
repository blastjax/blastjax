# blastjax

Personal dashboard app: browse and edit transactions in a web UI, with calendar views, category stats, accounts, installments, and payslip helpers, plus blood-pressure tracking and a handful of small games. The **API reads from a cloud PostgreSQL database** (Neon, via `DATABASE_URL`); payslips can be bulk-imported from nested JSON (`POST /api/payslip/import-json`).

## Stack

- **Backend:** Python, FastAPI, Uvicorn (`backend/`)
- **Frontend:** Next.js 15, React 19, TypeScript (`web/`)
- **Data:** PostgreSQL (Neon) — required, set `DATABASE_URL` in `.env` (see `.env.example`)
- **Cache:** Redis (optional; speeds up repeated reads, defaults to `localhost:6379` / the `redis` compose service)

## Prerequisites

- Python 3.11+ (recommended)
- Node.js 20+ and npm

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

   Set `DATABASE_URL` to your Neon Postgres connection string, using the *pooled* endpoint (the host containing `-pooler`). Startup verifies the expected tables exist and fails loudly if they don't; [`backend/schema.py`](backend/schema.py) owns the schema and its `create_all()` builds it on an empty database.

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

## Docker

`docker-compose.yml` is tuned for the EC2/Caddy deploy: **Caddy** is the sole public entry point (ports **80**/**443**, auto-HTTPS), and the `api`/`web` containers publish no host ports of their own. For a local run, `docker-compose.override.yml` is auto-merged in and adds direct host ports for `web` (**3000**) and `api` (**8000**) so you don't need Caddy or a domain — just run `docker compose up --build` from the repo root. The API container reads and writes the same Neon database as local runs, so `DATABASE_URL` must be set for it too. See [`docker/README.md`](docker/README.md) for commands and environment variables.

## Configuration

Login is opt-in and needs no environment variable: the app is open until you add at least one user under **Settings → Users** in the web app, after which every screen requires that username/password to log in (passwords are hashed with Argon2id).

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | **Required**; the Neon Postgres URL the API reads and writes (see `.env.example`). Use the *pooled* endpoint — the host containing `-pooler`. |
| `NEXT_PUBLIC_API_URL` | Optional; override API base URL for the web app (default `http://127.0.0.1:8000`). Omit or leave blank to keep the default. |
| `NEXT_PUBLIC_BASE_PATH` | Optional; set at **build** time with `STATIC_EXPORT=1` when the app is served under a subpath. |
| `BUDGET_CORS_ORIGINS` | Optional; comma-separated extra browser origins allowed by the API. |
| `BUDGET_SESSION_TTL_SECONDS` | Optional; server-side session cap in seconds once at least one user has been added (Settings → Users). Defaults to 43200 (12h). |
| `REDIS_URL` | Optional; Redis connection string for the API's cache. Defaults to `redis://localhost:6379` for a bare `uvicorn` run, `redis://redis:6379` for the `api` container. |
| `REDIS_CACHE_TTL` | Optional; cache entry lifetime in seconds. Defaults to 86400 (a day). A backstop only — every write invalidates the namespaces it affects, so lowering this doesn't make the app fresher, it just sends more reads to Neon. |
| `BUDGET_DB_POOL_KEEP` | Optional; Postgres connections kept pooled between requests. Defaults to 6, sized to a page load's fan-out so repeat visits don't pay for fresh TLS handshakes. |
| `BUDGET_DB_POOL_MAX` | Optional; ceiling on concurrent Postgres connections. Defaults to 10. |
| `BUDGET_DB_PROBE_AFTER_SECONDS` | Optional; how long a pooled connection may sit idle before a checkout spends a `SELECT 1` liveness check on it. Defaults to 20. |
| `API_UID` / `API_GID` | Optional; uid:gid the api container runs as (default `1000:1000`). Only needed if the bind-mounted `data/` directory is owned by another user. |

> **Note:** `.env` is loaded with `override=True`, so values in the file win over variables already exported in the environment. Change the file, not the shell, when a setting doesn't seem to take effect.

## Deploying to EC2

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on every push to `main` (or manual dispatch). It builds the API and web images on GitHub-hosted runners and pushes them to GHCR, then deploys via **AWS SSM** (no SSH/port 22 required): it `git pull --ff-only`s on the instance, pulls the new images, and restarts the stack. It then waits for both containers to report **healthy** and fails the job otherwise, so a red run means "not deployed" rather than "deployed and broken". Deploys are serialized via a `concurrency` group.

One-time setup on the EC2 instance:
1. Clone this repo at the path you'll use below, point the domain in [`docker/Caddyfile`](docker/Caddyfile) at the instance, and create `.env` (see `.env.example`) if you need to override any defaults — `NEXT_PUBLIC_API_URL` is normally left unset so the built-in web image build arg (`http://127.0.0.1:8000`) is overridden instead by `secrets.NEXT_PUBLIC_API_URL` at build time in CI, set to the site's own public URL (see "Before exposing this publicly" below).
2. Install Docker + the Compose plugin, and run `docker compose up -d` once by hand to confirm it works.
3. Ensure the SSM agent is running and the instance has an IAM role allowing it, and that the GitHub Actions role (`vars.AWS_DEPLOY_ROLE_ARN`, assumed via OIDC) can call `ssm:SendCommand` / `ssm:GetCommandInvocation` on it.
4. The deploy script runs as root via SSM and needs passwordless access to `chown -R 1000:1000 data`, because the api container runs unprivileged as uid 1000 and the `data/` bind mount keeps host ownership — a directory left behind by an older root-run container would otherwise be unwritable.

### Before exposing this publicly

- **TLS is already terminated by Caddy** (see `docker/Caddyfile`), which auto-provisions and renews a Let's Encrypt cert for the domain configured there and proxies `/api/*` to the `api` service, everything else to `web` — a domain name pointed at the instance is the only prerequisite. `api` and `web` publish no host ports of their own in `docker-compose.yml`, so they're only reachable through Caddy.
- **Restrict the security group** to just ports 80/443 (and 22/SSM as needed) — Redis is published loopback-only and the API/web containers aren't exposed directly.
- Because the API is proxied under the same origin as the web app, set `NEXT_PUBLIC_API_URL` to the site's own URL (e.g. `https://blastjax.example.com`) — this avoids CORS entirely.

Repository secrets (**Settings → Secrets and variables → Actions → Secrets**):

| Secret | Purpose |
|--------|---------|
| `APP_DIR` | Absolute path to the cloned repo on the instance, e.g. `/home/ubuntu/blastjax`. |
| `BUDGET_CORS_ORIGINS` | Optional; comma-separated extra browser origins allowed by the API (see below). |
| `NEXT_PUBLIC_API_URL` | Build-time API base URL baked into the web image; must be reachable from visitors, not just the instance. |

Repository variables (**...Actions → Variables**):

| Variable | Purpose |
|----------|---------|
| `AWS_DEPLOY_ROLE_ARN` | ARN of the IAM role the workflow assumes (via OIDC) to call SSM against the instance. |
| `AWS_REGION` | AWS region the instance and SSM calls run in. |
| `EC2_INSTANCE_ID` | Instance ID (`i-...`) the deploy targets. |

## Project layout

| Path | Contents |
|------|----------|
| `backend/` | FastAPI app, DB layer, routers |
| `web/` | Next.js app (dashboard, calendar, stats, health, games, settings, …) |
| `docker/` | Dockerfiles, Caddyfile, docker docs |

## License

[MIT](LICENSE)
