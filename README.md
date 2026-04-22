# Budget manager

Personal budget workbook app: import transactions from Excel, browse and edit them in a web UI, with calendar views, category stats, accounts, installments, and payslip helpers. The **API reads from SQLite**; Excel is used for upload/import only.

## Stack

- **Backend:** Python, FastAPI, Uvicorn (`backend/`)
- **Frontend:** Next.js 15, React 19, TypeScript (`web/`)
- **Data:** SQLite (`DATABASE_URL` in `.env`)

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

3. **Environment file**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` if needed. By default the database path is `sqlite:///./data/budget.sqlite` (relative to the project root). Ensure the `data/` directory exists or let the app create it on first run.

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

`docker compose` builds the API and web images, publishes ports **8000** and **3000**, and bind-mounts **`./data`** into the API container so SQLite stays on your machine. See [`docker/README.md`](docker/README.md) for commands and environment variables.

## GitHub Pages (static web only)

This repo includes [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml), which builds a **static export** of the Next app and publishes it with GitHub’s official **Pages / Actions** flow (no personal access token). In the repository, enable **Settings → Pages → Source: GitHub Actions**, then either push to `main`/`master` or run the workflow manually.

### Option A — Browser SQLite (WASM, no backend)

The workflow sets **`NEXT_PUBLIC_USE_WASM_SQLITE=1`**, which enables **[sql.js](https://sql.js.org/)** in the browser: the app fetches **`/budget.sqlite`** (plus your repo’s **`NEXT_PUBLIC_BASE_PATH`** on project sites), opens it in WASM, and serves **installment**, **payslip**, and **`/api/health`** from that in-memory database. Other API routes return **501** until you use a real FastAPI host.

1. **Seed file:** Before deploy, place your database at **`web/public/budget.sqlite`** (e.g. copy from `data/budget.sqlite`), or commit it if you are comfortable publishing that snapshot. The workflow also copies `data/budget.sqlite` when that path exists in the checkout (normally `data/` is gitignored, so use a [build secret](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions) or a private artifact step if you need CI-only DBs).
2. **WASM binary:** `npm install` in `web/` runs **`scripts/copy-sqljs-wasm.mjs`**, copying `sql-wasm.wasm` into **`web/public/sqljs/`** so Pages can load it.
3. **Edits:** Writes are persisted to **IndexedDB** in the browser and reloaded on the next visit. Clearing site data resets to the baked-in `budget.sqlite` from the last deploy.

Local static test:

```bash
cd web
set NEXT_PUBLIC_USE_WASM_SQLITE=1
set STATIC_EXPORT=1
npm run build:static
npx serve out
```

(Use `export` instead of `set` on macOS/Linux.)

### Option B — Static UI + hosted FastAPI

1. Omit **`NEXT_PUBLIC_USE_WASM_SQLITE`** (or set it to `0`) in the workflow and set a [repository variable](https://docs.github.com/en/actions/learn-github-actions/variables) **`NEXT_PUBLIC_API_URL`** to the **public** base URL of your FastAPI instance.
2. For project sites (`https://YOURUSER.github.io/REPO/`), the workflow sets **`NEXT_PUBLIC_BASE_PATH`** from the repository name; for a **`YOURUSER.github.io`** user site repository, the base path is left empty.

**Note:** GitHub Pages only serves static files; protect your FastAPI host at the network layer (VPN, firewall, reverse proxy auth, etc.) if the API must not be public.

## Configuration

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | SQLite URL (see `.env.example`) |
| `NEXT_PUBLIC_API_URL` | Optional; override API base URL for the web app (default `http://127.0.0.1:8000`). Omit or leave blank to keep the default. |
| `NEXT_PUBLIC_USE_WASM_SQLITE` | Set to `1` at **build** time to use sql.js in the browser (GitHub Pages WASM path); installments + payslip APIs only. |
| `NEXT_PUBLIC_WASM_SQLITE_URL` | Optional; full URL or path to the seed `.sqlite` file (default `{basePath}/budget.sqlite`). |
| `BUDGET_CORS_ORIGINS` | Optional; comma-separated extra browser origins allowed by the API (add your GitHub Pages URL when the UI is hosted there). |
| `BUDGET_EXCEL_PATH` / upload | Excel import paths are documented in backend config as used |

## Project layout

| Path | Contents |
|------|----------|
| `backend/` | FastAPI app, DB layer, routers |
| `web/` | Next.js app (dashboard, calendar, stats, settings, …) |
| `data/` | Local SQLite DB (gitignored) |
| `dev.sh` | Convenience script to run API + web |

## License

[MIT](LICENSE)
