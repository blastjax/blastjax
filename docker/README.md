# Docker

## SQLite on the host

The API container mounts **`./data` on your machine** to **`/app/data`** inside the container and sets:

`DATABASE_URL=sqlite:////app/data/budget.sqlite`

Create the folder and place your database file there (or start the stack once and let the app create an empty file):

```bash
mkdir -p data
# optional: copy an existing DB
# cp /path/to/budget.sqlite data/budget.sqlite
```

Confirm the file is visible on the host and inside the API container:

```bash
ls -la data/budget.sqlite   # host (may not exist until first run creates it)
docker compose exec api ls -la /app/data
```

Compose sets **`BUDGET_SQLITE_WORKING_COPY=1`** by default. On **Windows Docker Desktop**, a bind-mounted `./data` folder often makes **every** SQLite journal mode fail with `disk I/O error`. The API then copies `budget.sqlite` from the mount to **`/tmp`** inside the container (normal filesystem), runs against that copy, and **`sync_sqlite_working_copy_maybe`** copies it back to `./data` when the process shuts down cleanly (`docker compose stop`, Ctrl+C). **`docker compose kill`** or `SIGKILL` skips that sync—avoid those if you need changes persisted to the host file immediately.

## Run

From the **repository root**:

```bash
docker compose build
docker compose up
```

- Web: `http://localhost:3000`
- API: `http://127.0.0.1:8000`

The web bundle is built with `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8000`). To change it, set the variable when building, for example:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000 docker compose build web
```

If the UI is opened from another origin, add it to **`BUDGET_CORS_ORIGINS`** in a root `.env` file or export it before `docker compose up`.
