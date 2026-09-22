# Docker

## Database

The API stores everything in a cloud PostgreSQL database (Neon). **`DATABASE_URL` is required**: compose
passes it to the **`api`** service from the environment (or a repo-root `.env`) via
`${DATABASE_URL:?...}`, so `docker compose up` fails outright when it is unset rather than starting an API
that cannot reach its database. Use the *pooled* endpoint — the host containing `-pooler` — since the API
opens many short-lived connections.

The container talks to the same database a local `uvicorn` run does, so there is no separate container
state to provision. The repo-root **`./data`** directory is still bind-mounted to **`/app/data`**, but the
app neither reads nor writes it; it is only somewhere for exports written from inside the container.

Every other setting the `api` container receives (`REDIS_URL`, `BUDGET_CORS_ORIGINS`, `BUDGET_SESSION_TTL_SECONDS`, …) is
listed explicitly under that service's `environment:` in `docker-compose.yml`, each as `${VAR:-default}`. There's
no `env_file: .env` passing the whole file through — compose only auto-loads `.env` from the repo root to fill in
those `${...}` placeholders (nothing is copied into the image or container), so adding a new setting means adding
a line to `docker-compose.yml`, not just to `.env`.

## Login

`docker-compose.override.yml` (gitignored, auto-merged only on a local `docker compose up`) sets
**`BUDGET_DISABLE_AUTH=1`** on the `api` service, so a local run never asks for a username/password —
`login_required()` in `backend/app/security.py` short-circuits and every route is open. It is needed
because the container reads the same Neon database as the deploy, which already has users, so login
would otherwise be demanded on each browser restart.

Delete that block from the override to test the real login flow. Never set the variable on a host that
is reachable from anywhere else: it unauthenticates the whole API. The deployed stack can't pick it up
by accident — the EC2 host deploys from `git pull`, which never brings the ignored override file with it.

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
- Database: cloud PostgreSQL (Neon), addressed by `DATABASE_URL` — nothing is stored on the host

The web bundle is built with `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8000`). To change it, set the variable when building, for example:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000 docker compose build web
```

If the UI is opened from another origin, add it to **`BUDGET_CORS_ORIGINS`** in a root `.env` file or export it before `docker compose up`.
