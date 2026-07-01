# Ticketing System

A small Kanban-style ticket tracker built as a three-tier SPA: React frontend, Express/TypeScript API, and a PostgreSQL database. Users organize work **tickets** by **team**, optionally group them under **epics**, and move them through a fixed five-state Kanban workflow.

Built to the *Hackathon Ticketing System* requirements specification.

## Stack

- **Frontend:** React + TypeScript + Vite (served by nginx in a container)
- **Backend:** Node.js + Express + TypeScript, Prisma ORM
- **Database:** PostgreSQL 16
- **Auth:** local email/password, bcrypt-hashed, JWT bearer tokens, email verification via SMTP
- **Tests:** Jest (backend unit + integration on a real DB), Playwright (e2e)

## Run in containers (recommended)

The stack ships as standard OCI containers (`Dockerfile` + `docker-compose.yml`), so it runs on any compliant container runtime.

> **DataArt policy:** Docker Desktop and other Docker Products are **not approved** for use at DataArt (license limitations). Use an approved runtime instead — [Podman](https://podman.io/) / Podman Desktop or [Rancher Desktop](https://rancherdesktop.io/). Docker *Engine* on Linux (as used by the CI runners) is fine.

From a clean checkout, at the repository root:

```bash
podman compose up --build
```

Podman reads the same `docker-compose.yml`. (Rancher Desktop also works — it ships a drop-in `docker` CLI, so `docker compose up --build` behaves identically.)

- Frontend → **http://localhost:8080** (nginx proxies `/api` to the backend)
- Backend API → http://localhost:4000
- The backend applies database migrations on start. A fresh database contains **no application data** — create teams/epics/tickets through the UI or API.

Only an approved container runtime with Compose support is required on the host. Override secrets and SMTP via environment variables (see below).

### Configuration (environment variables)

| Variable | Purpose | Default |
|----------|---------|---------|
| `JWT_SECRET` | Signs access tokens | `change-me-in-production` |
| `SMTP_HOST` | SMTP server for verification email (e.g. `relay1.dataart.com`) | unset → emails logged to console |
| `SMTP_PORT` / `SMTP_SECURE` | SMTP port / TLS | `25` / `false` |
| `SMTP_USER` / `SMTP_PASS` | SMTP credentials (optional) | unset |
| `MAIL_FROM` | From address | `no-reply@ticket-tracker.local` |

Example:

```bash
JWT_SECRET=super-secret SMTP_HOST=relay1.dataart.com podman compose up --build
```

When `SMTP_HOST` is unset (local dev), verification emails are printed to the backend container logs so you can complete the flow without a mailbox.

## Local development (without containers)

Requires Node.js and a running PostgreSQL.

```bash
# Database
createdb tracker

# Backend
cd backend
cp .env.example .env            # set DATABASE_URL + JWT_SECRET
npm install
npx prisma migrate deploy
npm run dev                     # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                     # http://localhost:3000 (proxies /api → :4000)
```

## Using the app

1. **Sign up** with an email and password (≥ 8 chars).
2. Open the verification email (or the backend console in dev) and **verify** the token at `/verify-email`. Unverified accounts cannot use the app; a new email can be requested from the resend screen.
3. **Log in.**
4. Create a **Team**, optionally some **Epics**, then **Tickets** on the **Board**. Drag cards between the five columns to change state; filter by type/epic or search by title.

## Tests

```bash
# Backend (needs a `tracker_test` database for integration)
cd backend
npm run test:unit
npm run test:integration

# End-to-end (boots both servers)
cd ../e2e
npm install
npx playwright install chromium
npm test
```

## Documentation

- [PROGRESS.md](PROGRESS.md) — status vs the spec's Definition of Done
