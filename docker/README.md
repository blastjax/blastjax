# Docker

## Database

The API stores everything in a local SQLite file. Compose sets `DATABASE_URL=sqlite:////app/data/budget.sqlite`
for the **`api`** service and bind-mounts the repo-root **`./data`** directory to **`/app/data`**, so the same
file the app uses when run locally with `uvicorn` (`<repo root>/data/budget.sqlite`) is what the container reads
and writes too — nothing to provision or migrate before starting the container. This value is fixed in
`docker-compose.yml` and can't be overridden from `.env`: it has to match the bind mount, and a stray
`DATABASE_URL` in `.env` (left over from local dev, say) pointing anywhere else would silently not persist
across container restarts.

Every other setting the `api` container receives (`REDIS_URL`, `BUDGET_CORS_ORIGINS`, `BUDGET_OTP_SECRET`, …) is
listed explicitly under that service's `environment:` in `docker-compose.yml`, each as `${VAR:-default}`. There's
no `env_file: .env` passing the whole file through — compose only auto-loads `.env` from the repo root to fill in
those `${...}` placeholders (nothing is copied into the image or container), so adding a new setting means adding
a line to `docker-compose.yml`, not just to `.env`.

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
- Database file: `./data/budget.sqlite` on the host (bind-mounted into the `api` container)

The web bundle is built with `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8000`). To change it, set the variable when building, for example:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000 docker compose build web
```

If the UI is opened from another origin, add it to **`BUDGET_CORS_ORIGINS`** in a root `.env` file or export it before `docker compose up`.
