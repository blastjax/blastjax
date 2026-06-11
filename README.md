# Budget manager

Personal budget app: browse and edit transactions in a web UI, with calendar views, category stats, accounts, installments, and payslip helpers. The **API reads from PostgreSQL**; payslips can be bulk-imported from nested JSON (`POST /api/payslip/import-json`).

## Stack

- **Backend:** Python, FastAPI, Uvicorn (`backend/`)
- **Frontend:** Next.js 15, React 19, TypeScript (`web/`)
- **Data:** PostgreSQL (`DATABASE_URL` or `DB_*` in `.env`)

## Prerequisites

- Python 3.11+ (recommended)
- Node.js 20+ and npm
- PostgreSQL 14+ (local install, Docker, or a host such as Neon)

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

3. **PostgreSQL**

   Easiest with Docker (from repo root):

   ```bash
   docker compose up db -d
   ```

   Then use `DATABASE_URL=postgresql://postgres:blast@127.0.0.1:5433/budgetapp` in `.env` (see `.env.example`).

4. **Environment file**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your `DATABASE_URL` (or `DB_HOST` / `DB_NAME` / …).

5. **Frontend dependencies**

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

`docker compose` builds the API and web images, runs **Postgres** and the API together, and publishes ports **8000** and **3000**. See [`docker/README.md`](docker/README.md) for commands and environment variables.

## Configuration

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL URL (see `.env.example`) |
| `DB_HOST` / `DB_NAME` / … | Optional alternative to `DATABASE_URL` |
| `NEXT_PUBLIC_API_URL` | Optional; override API base URL for the web app (default `http://127.0.0.1:8000`). Omit or leave blank to keep the default. |
| `NEXT_PUBLIC_BASE_PATH` | Optional; set at **build** time with `STATIC_EXPORT=1` when the app is served under a subpath. |
| `BUDGET_CORS_ORIGINS` | Optional; comma-separated extra browser origins allowed by the API. |

## Project layout

| Path | Contents |
|------|----------|
| `backend/` | FastAPI app, DB layer, routers |
| `web/` | Next.js app (dashboard, calendar, stats, settings, …) |
| `dev.sh` | Convenience script to run API + web |

## License

[MIT](LICENSE)
