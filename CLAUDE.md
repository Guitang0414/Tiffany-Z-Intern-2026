# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI News Curation Agent & Publishing Pool for epochtimesnw.com (Seattle Chinese community news). The system automates: news scraping -> AI rewriting -> editorial review -> multi-platform publishing (WordPress + Twitter).

Primary language: Chinese (Simplified) for all user-facing content and documentation.

## Architecture (4 Layers)

1. **Agent Layer** (Hermes Agent + Claude API) — runs in isolated environment, communicates with backend only via Webhook (`POST /api/v1/webhook/incoming-news` with `X-Agent-Key` header). Never connects directly to the database.
2. **Backend** (Python 3.12 + FastAPI + SQLAlchemy 2.0 + Alembic + PostgreSQL 16) — central API server handling auth, business logic, and distribution triggers.
3. **Frontend Pool** (React 18 + TypeScript + Vite + Zustand + TipTap) — editor review dashboard with side-by-side original/AI content comparison.
4. **Distribution Layer** — WordPress REST API + Twitter API v2, independent per channel (one failure doesn't block the other).

## Key Design Decisions

- Agent is zero-trust: all agent data is validated server-side, API Key can be rotated anytime
- Human review is mandatory before publishing (no auto-publish)
- Article status machine: `PENDING -> PUBLISHING -> PUBLISHED`, `PENDING -> REJECTED`, `PUBLISHING -> FAILED -> PUBLISHING` (retry)
- Distribution channels are independent and individually retryable
- JWT auth for frontend (30min access + 7d refresh), API Key auth for agent webhook
- Roles: `editor` (review/edit) and `admin` (retry failed distributions, view stats)

## Tech Stack Quick Reference

| Layer | Stack |
|-------|-------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL 16 |
| Frontend | React 18, TypeScript, Vite, Zustand, TipTap (rich text) |
| Agent | Hermes Agent, Claude API |
| Deploy | Dokploy on Hetzner VPS (http://5.78.203.102) |
| Linting | Ruff (Python), ESLint (TypeScript) |

## Database

Two tables: `news_articles` (core content with status machine) and `users` (editors). See `HL-Intern-Project.md` Section 4 for full schema. Key fields:
- `source_url` has UNIQUE constraint (dedup)
- `status`: PENDING / PUBLISHING / PUBLISHED / FAILED / REJECTED
- `wp_post_id` and `tweet_id` store distribution receipts

## API Design

All endpoints under `/api/v1/`. Full request/response schemas in `docs/api-spec.md`. Webhook rate limited at 10 req/min. Pagination uses `page` + `page_size` params.

## Documentation Index

- `HL-Intern-Vision.md` — project vision and strategic rationale
- `HL-Intern-Project.md` — detailed spec (schema, API, security, milestones)
- `docs/architecture.md` — Mermaid architecture diagrams and data flow
- `docs/api-spec.md` — complete API request/response schemas
- `wordpress-training.md` — WordPress editor training manual for epochtimesnw.com
