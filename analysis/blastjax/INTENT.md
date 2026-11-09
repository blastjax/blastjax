# Modernization intent — blastjax

Date: 2026-11-09

## Goal

**understand** — answer to "What do you want to do with it?", verbatim: "Understand it first"

Map the system and list what it does; the assessment recommends whether to uplift, transform or reimagine next.
Immediate use: refresh the Software Architecture page (`web/public/software-architecture.html`) and `README.md`.

## From / to

- From: Python FastAPI backend (`backend/`) + Next.js / React / TypeScript frontend (`web/`), PostgreSQL (Neon),
  optional Redis cache, Docker Compose behind Caddy on EC2, deployed by GitHub Actions via AWS SSM.
- To: not chosen (goal is understand; `brief` must not guess a target stack).

## What must stay true

Answer to "What must stay true?", verbatim: "App keeps running, Fix known bugs as we go, Security review first, Behavior matches exactly"

- App keeps running — the live EC2 deploy keeps serving during any move.
- Fix known bugs as we go.
- Security review first — `harden` runs right after `assess`, before any build.
- Behavior matches exactly.

## Open items

- "Behavior matches exactly" and "Fix known bugs as we go" pull against each other: each known bug needs a
  decision (keep the quirk, or fix it and record the deliberate difference) when `review` / `verify` reach it.
