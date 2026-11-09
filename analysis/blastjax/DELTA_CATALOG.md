# Delta catalog — blastjax web uplift

Date: 2026-11-09 · Next.js 15.5.14 → 15.5.29 · Node 20 (end of life) → 24 LTS (22 noted) · Backend Python 3.14 unchanged

Produced by the version-delta-analyst agent on a scratch copy; nothing in the repo was modified. Tooling: `npm audit`,
`npm audit fix` (never `--force`) on the scratch copy. Next codemods are not needed for a patch bump.

**What this app does not use** (so most Next advisories do not bite): middleware, route handlers, server actions,
`next/image`, `headers()`/`cookies()`, server-side `fetch`, rewrites, `packageManager`/corepack. Exception:
`/_next/image` is served by the standalone server even though nothing renders `<Image>`.

## Deltas

| # | Delta | From → To | Affects | Required change | Risk |
|---|---|---|---|---|---|
| 1 | Next security fixes (DoS, cache poisoning, image-optimizer issues) | 15.5.14 → 15.5.29 | `web/package.json:16` (exact pin); `/_next/image` live in standalone | Bump the pin (in `security_remediation.patch`, SEC-001) | M |
| 2 | eslint-config-next to match | 15.5.14 → 15.5.29 | `web/package.json:29`; `FlatCompat` at `web/eslint.config.mjs:13` still works | Bump the pin (same patch) | L |
| 3 | Next 15.5.22+ refuses TypeScript ≥ 7 | — | `web/package.json:32` is `^5` (resolves 5.9.3) | None; do not widen to TS 7 | L |
| 4 | The Next bump fixes no transitive advisory | sharp 0.34.5, nanoid 3.3.11, source-map-js 1.2.1, js-yaml 4.1.1, postcss 8.5.8 | `web/package-lock.json` | `npm audit fix` (lockfile only) after the bump: sharp 0.35.5, nanoid 3.3.20, source-map-js 1.2.2, js-yaml 4.3.2, postcss 8.5.32 | M |
| 5 | sharp 0.34 → 0.35 (engines `>=20.9`) | — | only the image optimizer uses it; lockfile carries `@img/sharp-linux-x64@0.35.5` | None beyond #4 | L |
| 6 | Left after #1 and #4: 9 advisories (2 high, 7 moderate) | next's own `postcss@8.4.31` (build-time, own CSS only); `brace-expansion`, `minimatch` under ESLint (dev only) | no 15.5.x fixes the postcss one; audit only offers Next 16 | Decision: accept, or `"overrides": {"next": {"postcss": "^8.5.23"}}` (untested) | L |
| 7 | Node base image | `node:20-bookworm-slim` → `node:24-bookworm-slim` | `docker/Dockerfile.web:1` and `:18` | Change both stages together | M |
| 8 | CI Node | 20 → 24 | `.github/workflows/deploy.yml:35` | `node-version: 24` | L |
| 9 | Node types | `^20` → `^24` | `web/package.json:24` | Optional; `tsc` passes either way | L |
| 10 | Healthcheck uses global `fetch` + `process.exit` | — | `docker-compose.yml:73-77` | None on Linux (a libuv assert seen only on Windows Node 25) | L |
| 11 | npm 10 (Node 22) / 11 (Node 24); corepack dropped in Node 25 | — | lockfile v3, no `packageManager` field | None | L |
| 12 | OpenSSL 3.0 → 3.5, `require(esm)`, native TS stripping | — | no outbound TLS at runtime (Caddy terminates TLS); `next.config.ts` is compiled by Next | None | L |

**Node 22 vs 24:** Node 22 reaches end of life on 2027-04-30 (about six months from today); Node 24 is LTS into 2028.
Next 15.5 supports `>=20` and sharp 0.35 needs `>=20.9`, so target **Node 24**: the changes are the same as for 22.

**Next 16 (note only, not a target):** already compatible in places (Promise `params` in the `[company]` pages, no
middleware, plain `eslint`). Would break: `compat.extends("next/...")` in `web/eslint.config.mjs:13` (config 16 is
native flat config) and possibly the `webpack` block in `web/next.config.ts:17-26` once Turbopack is the default
builder. It would also clear delta #6.

## Test harness on the target

Verified on a scratch copy with next 15.5.29 (orchestrator run, and again by the agent after `npm audit fix`), on the
local Node 25.9:

- `npx tsc --noEmit` — exit 0, no changes.
- `npm run lint` — exit 0, no changes.
- `npx next build` (webpack, the Dockerfile path) — exit 0; standalone `server.js` produced; `/` and
  `/payslip/<company>` answered 200.
- `backend/test_core.py` — independent of Node; runs unchanged on Python 3.14 with Postgres.

So the existing harness runs on the target as is: no test-harness phase is needed first.

## Order and verification

1. **Next patch** (`web/`): `npm install next@15.5.29 eslint-config-next@15.5.29 --save-exact` (or apply
   `security_remediation.patch`), then `npm ls next eslint-config-next && npx tsc --noEmit && npm run lint && npx next build`.
2. **Transitive fixes:** `npm audit fix` (never `--force`, which installs Next 16), then `npm audit` (expect 9 left), rebuild.
3. **Image on today's Node:** `docker build -f docker/Dockerfile.web -t bj-web web`.
4. **Node 24:** edit `Dockerfile.web:1,18` and `deploy.yml:35` (optionally `@types/node`), then
   `docker build -f docker/Dockerfile.web -t bj-web:24 web && docker run --rm bj-web:24 node -v`,
   `docker compose up -d web && docker compose ps web` (expect healthy), and one CI run.
5. **Optional:** decide the postcss override (#6), confirm with `npm ls postcss` and a rebuild.

## Not verified here

`tsc`/lint/build on Node 22 or 24 binaries themselves (download blocked in the agent's sandbox; Node 25.9 was used);
anything Linux (the Docker image build, sharp 0.35.5 on bookworm, the healthcheck exit code); `next build --turbopack`
(the `npm run build` script) and `build:static`; the postcss override; `next/font/google` needs network at build time.
