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

## Configuration

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | SQLite URL (see `.env.example`) |
| `NEXT_PUBLIC_API_URL` | Optional; override API base URL for the web app (default `http://127.0.0.1:8000`) |
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
