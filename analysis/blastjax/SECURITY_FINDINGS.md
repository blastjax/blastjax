# Security findings — blastjax

Date: 2026-11-09 · Source: repository root at `d5d57f5` (read-only) · Command: `/code-modernization:modernize-harden`

**How this scan ran.** The Workflow tool is not available in this environment, so this used the documented fallback: one
adversarial **security-auditor** agent (the same agent type and scope the assess step used on the same revision; its scan
is reused here rather than repeated), with `npm audit` and `ruff --select S` as SAST. The orchestrator then re-read the
cited code for every Critical and High finding (#1–#3) and for #4, #5 and #8; all were confirmed. `npm audit` was re-run
for this report.

3 credentials found in local, gitignored files (`.env`, `.env.local`), none in tracked source or git history —
inventory in SECRETS.local.md (gitignored; not for sharing).

## Scorecard

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 2 |
| Medium | 7 |
| Low | 9 |
| Info | 1 |
| **Total** | **20** |

Top CWE categories: access control and authentication (CWE-862, 306, 1188, 307, 613, 208, 346: 8 findings); resource
limits and input handling (CWE-400, 770, 434: 3); outdated or vulnerable components (CWE-1395, 1104: 2); SSRF (CWE-918: 1);
cleartext transport (CWE-319: 1).

## Coverage gaps

- **Not scanned: Python dependencies.** `pip-audit` is not installed, so `backend/requirements.txt` was not checked for
  known CVEs. To close it: `backend/venv/Scripts/python -m pip install pip-audit` then
  `backend/venv/Scripts/python -m pip_audit -r backend/requirements.txt`, and re-run this command.
- **Not judged: findings #4–#20.** A single auditor found them; there was no refuter pass (that needs the Workflow tool).
  #4, #5 and #8 were re-read by the orchestrator and hold; the rest carry the auditor's severity without a second
  opinion. Counts above cover all 20 as reported, not a verified false-positive rate.

Offer: once `pip-audit` is installed, re-run `/code-modernization:modernize-harden blastjax` to cover the Python side.

## Findings

| ID | CWE | Severity | Finding | Location | Fix |
|---|---|---|---|---|---|
| SEC-001 | 1395 | Critical | Next.js 15.5.14 is inside a critical advisory range (npm audit: 1 critical, 6 high, 9 moderate); the public site serves `/_next/image` | `web/package.json:16` | Next.js ≥ 15.5.29 (patch) |
| SEC-002 | 862 | High | User administration and page permissions are enforced only in the browser: any logged-in user can create, delete or re-permission users (incl. granting themselves `is_superuser`), reset passwords, and call every data API | `backend/app/routers/user.py:37-78`; `backend/app/deps.py:17-23`; `web/src/components/AuthGate.tsx:74` | Server-side Settings check on `/api/users` (patch); per-router page checks need a decision (see log) |
| SEC-003 | 1188 / 306 | High | Login fails open: with zero users the whole API is open and the first `POST /api/users` owns it; deleting the last user reopens everything | `backend/app/security.py:80-94`; `backend/app/deps.py:17-19` | Refuse deleting the last user (patch); first-user bootstrap is a documented feature, left as a decision |
| SEC-004 | 918 | Medium | SSRF: only the first Maps URL is checked against the Google allowlist; `urllib` follows redirects to any host (internal addresses included) and returns page text | `backend/app/routers/travel.py:69-81` | Disable redirects; follow ≤ 3 hops manually, re-checking https, allowlist and non-private IP |
| SEC-005 | 307 / 400 | Medium | Login throttling keys on `request.client.host`, which is the proxy for every user (uvicorn does not trust Caddy's forwarded header): 8 bad logins from anyone lock out all users | `backend/app/routers/auth.py:63-64,96`; `docker/Dockerfile.backend:28` | `--proxy-headers --forwarded-allow-ips=<edge network>`; throttle per (IP, username) |
| SEC-006 | 613 | Medium | Sessions never expire; a password change does not revoke sessions; a deleted user's token stays valid from Redis up to 5 min | `backend/app/security.py:107-126`; `backend/app/routers/user.py:53-63` | `expires_at` + idle timeout; revoke on password change and user delete |
| SEC-007 | 400 | Medium | Image resize bomb: an extreme-aspect PNG passes Pillow's pixel check, then is resized to an enormous canvas | `backend/app/services/bill_extract.py:143-145` | Reject extreme aspect ratios / pixel counts before resizing |
| SEC-008 | 319 | Medium | The Caddy site also answers on a bare public IP over plain HTTP: passwords and bearer tokens can travel unencrypted; no HSTS | `docker/Caddyfile:1` | Drop the IP site or redirect it to HTTPS; add HSTS |
| SEC-009 | 307 | Medium | `/api/users/verify` lets a session holder test passwords with no rate limit | `backend/app/routers/user.py:46-50` | Now Settings-only (patch, SEC-002); also throttle or remove |
| SEC-010 | 1104 | Medium | Node 20 is end of life (web image and CI) | `docker/Dockerfile.web:1,18`; `.github/workflows/deploy.yml:36` | Node 24 LTS (see `DELTA_CATALOG.md`) |
| SEC-011 | 377 / 78 | Low | Deploy writes `DATABASE_URL` and `GITHUB_TOKEN` into `/tmp` scripts with default permissions; a `'` in a secret breaks quoting; `ref_name` is pasted into the shell | `.github/workflows/deploy.yml:95-140` | `umask 077`, pass values as env, pipe over `ssh 'bash -s'` |
| SEC-012 | 295 | Low | `ssh-keyscan` trusts whatever host key it sees on every deploy | `.github/workflows/deploy.yml:91` | Pin `known_hosts` in a secret |
| SEC-013 | 922 / 1021 | Low | Token in localStorage, never expires; no CSP, nosniff or frame-ancestors headers | `web/src/lib/auth.ts:17`; `docker/Caddyfile` | HttpOnly SameSite cookie, or a strict CSP and security headers |
| SEC-014 | 434 / 770 | Low | Uploads accept a PDF by client Content-Type alone; the whole body is read before the 10 MB check; no Caddy body limit | `backend/app/deps.py:32-40`; `backend/app/routers/bill.py:145-150` | Require magic bytes; stream with a limit; Caddy `request_body max_size` |
| SEC-015 | 306 | Low | Redis has no password yet holds auth state (`users_exist`, session lookups) | `backend/app/security.py:88-91,120-122`; `docker-compose.yml:2-6` | `requirepass`/ACL; never trust a cached "no users" |
| SEC-016 | 346 / 362 | Low | Passkey RP ID comes from the request's Origin/Host; taking a challenge is not atomic | `backend/app/routers/auth.py:75-81`; `backend/app/security.py:164-167` | Pin RP ID and origin in config; `GETDEL` |
| SEC-017 | 601 | Low | Map URLs stored unvalidated and rendered as links | `backend/app/schemas/travel.py`; `web/src/lib/maps.ts:10` | Accept only https Google-host links |
| SEC-018 | 208 | Low | Login skips Argon2 for unknown usernames (timing reveals which exist) | `backend/app/routers/auth.py:99-100` | Verify against a dummy hash |
| SEC-019 | 250 / 532 | Low | App connects as the Neon owner role and runs DDL at start; the Redis URL is logged in full | `backend/schema.py:674`; `backend/cache.py:48,50` | Separate migration and app roles; log the host only |
| SEC-020 | — | Info | `allow_credentials=True` is unneeded with bearer auth; localhost origins always allowed in production; `backend/.dockerignore` misses `venv/`; GitHub Actions not SHA-pinned | `backend/app/factory.py:19-27,103` | Tighten CORS; pin actions |

Checks that came back clean: SQL injection (ORM throughout; search uses `icontains(autoescape=True)` with a length cap),
command injection (tesseract via argv, no shell), path traversal (files are DB blobs keyed by UUID), deserialization
(Redis holds JSON), password hashing (Argon2) and tokens (`secrets.token_urlsafe`, stored as SHA-256), fixed outbound URLs
for PCSO and Nominatim, non-root containers, Redis and API not publicly exposed, the production deploy never loads the
auth-disabling override. No instruction-shaped text aimed at automated reviewers was found in the source.

## Dependency advisories (web, `npm audit` 2026-11-09)

| Package | Installed | Advisories (first listed) | Fixed by |
|---|---|---|---|
| next | 15.5.14 | critical: GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj, GHSA-3g8h-86w9-wvmq, GHSA-ffhc-5mcf-pf4q (+24 more) | next 15.5.29 (SEC-001 patch) |
| postcss | 8.5.8 | high: GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849 | `npm audit fix` → 8.5.32; next's own pinned copy stays (build-time only) |
| sharp | 0.34.5 | high: GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w | `npm audit fix` → 0.35.5 |
| js-yaml | 4.1.1 | high: GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh | `npm audit fix` → 4.3.2 (dev only) |
| nanoid | 3.3.11 | high: GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8, GHSA-xwg4-73v4-xw9w | `npm audit fix` → 3.3.20 |
| source-map-js | 1.2.1 | high: GHSA-68fv-2mgg-jv7q | `npm audit fix` → 1.2.2 |
| brace-expansion | (eslint tree) | high: GHSA-f886-m6hf-6m8v, GHSA-jxxr-4gwj-5jf2, GHSA-3jxr-9vmj-r5cp | `npm audit fix` (dev only) |
| 9 moderate (`@typescript-eslint/*`, glob, minimatch, rimraf, `@humanfs/node`) | — | e.g. GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249, GHSA-p498-v437-472g | `npm audit fix` (dev only) |

Python dependencies: **not audited** (see Coverage gaps).

## Remediation log

Only Critical and High findings get hunks, per the command. The patch is `security_remediation.patch` (shareable). There is
no `.local.patch`: no credential lives in tracked source; the credentials in the local `.env` files need rotation, not a
code change (see `SECRETS.local.md`).

| Finding | Fix | Carried by |
|---|---|---|
| SEC-001 | `next` and `eslint-config-next` 15.5.14 → 15.5.29 in `web/package.json`, with the regenerated `web/package-lock.json` so `npm ci` (CI, `Dockerfile.web`) installs the fix. Verified on a scratch copy: install, `tsc --noEmit`, `npm run lint`, `next build` all pass; npm audit then shows 0 critical. | `security_remediation.patch` |
| SEC-002 | New `require_settings_access` in `backend/app/deps.py`, the server's copy of the web rule `isPageAllowed("/settings")` (superuser, unrestricted `allowed_pages`, or `/settings` listed; open mode stays open), applied to the whole `/api/users` router. Legitimate users see no change: only `UsersSettingsPanel.tsx` calls these routes. Also closes SEC-009 for users without Settings. | `security_remediation.patch` |
| SEC-002 (rest) | **Needs a decision, not patched:** enforcing `allowed_pages` on the data routers. Pages read across domains (the calendar alone calls 8 routers), so a page→router map must be designed, and it changes behavior for restricted users. | — |
| SEC-003 | `users_remove` refuses to delete the last user (409); an unknown id still gets 404. **Behavior change:** today the last user can be deleted. Drop the hunk to keep today's behavior. | `security_remediation.patch` |
| SEC-003 (rest) | **Needs a decision, not patched:** the open-until-first-user bootstrap is a documented feature (README, Configuration). Failing closed (first admin via a CLI or one-time token) changes setup. | — |
| SEC-002/003 test | `check_settings_access` in `backend/test_core.py`: allowed/denied users, 401 for no or stale session, open mode, last-user 409, unknown-id 404, non-last delete 200. The patched suite passed 23/23 against a throwaway Postgres 17. | `security_remediation.patch` |

Apply from the repository root: `git apply analysis/blastjax/security_remediation.patch` (or
`patch -p1 < analysis/blastjax/security_remediation.patch`), then `python backend/test_core.py` and
`cd web && npm ci && npx tsc --noEmit && npm run lint`. Re-run `/code-modernization:modernize-harden blastjax` after
applying to confirm.

## Patch review

A second security-auditor reviewed every hunk against the code (read-only, `git apply --check` dry run, no credentials
anywhere in the patch).

| Hunk | Round 1 | Round 2 |
|---|---|---|
| `deps.py` imports | RESOLVES — no import cycle | — |
| `deps.py` `_bearer_token` / `require_settings_access` | RESOLVES — matches `isPageAllowed('/settings')`; `[]` → 403, `null` → allowed, stale session → 401 (stricter than the web, correct). Nit: duplicates `auth.py:58` `_bearer_token` | — |
| `user.py` import | RESOLVES | — |
| `user.py` router dependency | RESOLVES — runs after `require_session`; also gates `/verify`, whose only caller is the Settings panel | — |
| `user.py` last-user guard | RESOLVES with nits: 409 instead of 404 for an unknown id when one user is left; concurrent-delete race (commented) | RESOLVES — unknown id now 404; ids compare as `uuid.UUID`; race still commented |
| `test_core.py` check | RESOLVES — gaps: no `[]` case, no non-last delete | RESOLVES — both added |
| `package.json` `next` | **PARTIAL** — lockfile still pinned 15.5.14, so `npm ci` would fail | RESOLVES — lockfile now in the patch, resolves next 15.5.29 (integrity matches the registry) |
| `package.json` `eslint-config-next` | RESOLVES | — |
| `package-lock.json` (14 hunks) | — | RESOLVES — next, `@next/*`, eslint-config-next to 15.5.29; one out-of-scope but harmless dev-only `fastq` 1.20.1 → 1.20.3 |

No hunk failed its last review. Residual risks the patch does not cover: SEC-004 to SEC-020 (Medium and below), the two
decisions above, and the 15 other npm advisories (`npm audit fix` and the Node 24 move in `DELTA_CATALOG.md`).
