# Budget manager

Personal budget app: browse and edit transactions in a web UI, with calendar views, category stats, accounts, installments, and payslip helpers. The **API reads from a local SQLite file**; payslips can be bulk-imported from nested JSON (`POST /api/payslip/import-json`).

## Stack

- **Backend:** Python, FastAPI, Uvicorn (`backend/`)
- **Frontend:** Next.js 15, React 19, TypeScript (`web/`)
- **Data:** SQLite (`data/budget.sqlite`, self-creating; override with `DATABASE_URL` in `.env`)

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

3. **Environment file** (optional — the app runs with no `.env` at all, using a self-creating `data/budget.sqlite`)

   ```bash
   cp .env.example .env
   ```

   Only edit `.env` if you want the SQLite file somewhere other than `data/budget.sqlite`.

4. **Frontend dependencies**

   ```bash
   cd web && npm install && cd ..
   ```

## Run locally

The UI expects the API at **`http://127.0.0.1:8000`** unless you set `NEXT_PUBLIC_API_URL` for the Next.js app.

**Option A — two terminals**

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

**Option B — Git Bash on Windows**

From the project root:

```bash
./dev.sh
```

This starts the backend and web (uses `venv` under the project root when present).

## Docker

`docker compose` builds the API and web images and publishes ports **8000** and **3000**. The API container reads/writes the same `data/budget.sqlite` file as local runs, bind-mounted from the repo root. See [`docker/README.md`](docker/README.md) for commands and environment variables.

## Configuration

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Optional; SQLite file location (see `.env.example`). Defaults to `data/budget.sqlite`. |
| `NEXT_PUBLIC_API_URL` | Optional; override API base URL for the web app (default `http://127.0.0.1:8000`). Omit or leave blank to keep the default. |
| `NEXT_PUBLIC_BASE_PATH` | Optional; set at **build** time with `STATIC_EXPORT=1` when the app is served under a subpath. |
| `BUDGET_CORS_ORIGINS` | Optional; comma-separated extra browser origins allowed by the API. |
| `BUDGET_OTP_SECRET` | Optional; TOTP secret. When set, the API and web app require a 6-digit authenticator-app code to log in (a new browser session always re-prompts). Generate one with `python -c "import pyotp; print(pyotp.random_base32())"`. |
| `BUDGET_SESSION_TTL_SECONDS` | Optional; server-side session cap in seconds once `BUDGET_OTP_SECRET` is set. Defaults to 43200 (12h). |
| `WEB_PORT` | Optional; host port `docker-compose` publishes the web container on. Defaults to 3000; set to 80 in the server's `.env` for a plain-HTTP deployment. |
| `API_UID` / `API_GID` | Optional; uid:gid the api container runs as (default `1000:1000`). Only needed if the bind-mounted `data/` directory is owned by another user. |

> **Note:** `.env` is loaded with `override=True`, so values in the file win over variables already exported in the environment. Change the file, not the shell, when a setting doesn't seem to take effect.

## Deploying to EC2

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on every push to `main` (or manual dispatch). It first runs [`checks.yml`](.github/workflows/checks.yml) (web typecheck + lint + production build, backend compile + app import); only if those pass does it SSH in, `git pull --ff-only`, rebuild, and restart the stack. It then waits for both containers to report **healthy** and fails the job otherwise, so a red run means "not deployed" rather than "deployed and broken". Deploys are serialized via a `concurrency` group, and the image is built on the instance — no registry involved.

One-time setup on the EC2 instance:
1. Clone this repo and create `.env` (see `.env.example`) at the path you'll use below, including `WEB_PORT=80` and a `NEXT_PUBLIC_API_URL` that points at the instance's public address (not `127.0.0.1` — that build arg is baked into the browser bundle, so it must be reachable from the visitor's machine, not just from the instance).
2. Install Docker + the Compose plugin, and run `docker compose up -d` once by hand to confirm it works.
3. Ensure the deploy user has passwordless `sudo` (the workflow runs `sudo chown -R 1000:1000 data`, because the api container runs unprivileged as uid 1000 and the `data/` bind mount keeps host ownership — a directory left behind by an older root-run container would otherwise be unwritable).

### Before exposing this publicly

- **Terminate TLS.** With `WEB_PORT=80` the OTP code and the session token cross the network in cleartext, so anyone on the path can capture a session. Put a reverse proxy (Caddy or nginx + Let's Encrypt) in front and serve HTTPS — a domain name is the only prerequisite.
- **Restrict the security group** to your own IP where practical. Compose publishes Redis on loopback only, but port 8000 (the API) must stay reachable by browsers as long as `NEXT_PUBLIC_API_URL` points straight at it.
- Serving the API under the same origin as the web app (proxying `/api` to port 8000) avoids CORS entirely and means `NEXT_PUBLIC_API_URL` can just be the site's own URL.

Repository secrets (**Settings → Secrets and variables → Actions → Secrets**):

| Secret | Purpose |
|--------|---------|
| `EC2_HOST` | Public IP or hostname of the instance. |
| `EC2_USERNAME` | SSH user (e.g. `ubuntu`). |
| `EC2_SSH_KEY` | Private key matching a public key in the instance's `~/.ssh/authorized_keys`. |

Repository variables (**...Actions → Variables**):

| Variable | Purpose |
|----------|---------|
| `APP_DIR` | Absolute path to the cloned repo on the instance, e.g. `/home/ubuntu/budgetapp`. |
| `EC2_SSH_PORT` | Optional; SSH port if not 22. |

## Project layout

| Path | Contents |
|------|----------|
| `backend/` | FastAPI app, DB layer, routers |
| `web/` | Next.js app (dashboard, calendar, stats, settings, …) |
| `dev.sh` | Convenience script to run API + web |

## License

[MIT](LICENSE)
