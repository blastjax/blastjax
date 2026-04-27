# Docker

## PostgreSQL

Compose runs **Postgres 16** as service **`db`** and points the API at:

`postgresql://postgres:blast@db:5432/budgetapp`

Data lives in the **`pgdata`** named volume. The **`api`** service loads your root **`.env`** (`env_file`). Use the same **`DATABASE_URL`** as on the host (for example `...@127.0.0.1:5433/budgetapp`); inside the container the backend **rewrites** `127.0.0.1` / `localhost` to **`db:5432`** so Compose networking works. Remote URLs (Neon, etc.) are left unchanged.

## Builds (cache + image size)

- **Compose** uses a **small build context per service** (`./backend` for API, `./web` for the UI) so unrelated file changes do not invalidate the other image’s layers.
- **BuildKit** (default in current Docker Desktop) enables cache mounts in the Dockerfiles: `pip` wheels under `/root/.cache/pip`, npm under `/root/.npm`, and Next’s compiler cache under `/app/.next/cache`. Rebuilds after dependency changes are much faster than a cold build.
- The **web** image ships a **[Next.js standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)** bundle (`node server.js`) instead of the full `node_modules` tree, which shrinks the final layer set.

## Run

From the **repository root**:

```bash
docker compose build
docker compose up
```

- Web: `http://localhost:3000`
- API: `http://127.0.0.1:8000`
- Postgres on the host: `localhost:5433` (user `postgres`, password `blast`, db `budgetapp`)

The web bundle is built with `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8000`). To change it, set the variable when building, for example:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000 docker compose build web
```

If the UI is opened from another origin, add it to **`BUDGET_CORS_ORIGINS`** in a root `.env` file or export it before `docker compose up`.
