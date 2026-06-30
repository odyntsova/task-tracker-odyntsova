# Task Tracker

A full-stack task tracker for a cross-functional team (Developers, Manual QA, QA Automation, Product Manager). Built incrementally as complete vertical slices — each feature covered from the database up to the UI, with tests at every level of the pyramid.

## Tech stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL 16 + Prisma ORM
- **Testing:** Jest (unit + integration), Playwright (e2e)
- **CI:** GitHub Actions

## Features

- **Auth** — register / login / me / logout, JWT, password hashing, rate limiting
- **Tasks** — CRUD, status workflow state-machine, assignee, filtering / search / pagination
- **Projects & Sprints** — sprint planning, assigning tasks to sprints
- **RBAC** — role-based permissions (ADMIN / PM / DEVELOPER / QA / QA_AUTO)
- **Kanban board** — drag & drop, respecting the status workflow rules

## Testing

126 automated tests, all green:

| Level | Count | What it covers |
|-------|-------|----------------|
| Unit | 80 | route logic (mocked Prisma) |
| Integration | 25 | real PostgreSQL — constraints, RBAC, pagination |
| E2E | 21 | Playwright in a real browser |

## Project structure

```
backend/    # Express API + Prisma (schema, migrations, tests)
frontend/   # React app (pages, services, types)
e2e/        # Playwright tests (Page Object Model)
.claude/    # Claude Code role agents (dev / qa-manual / qa-auto / pm)
```

## Getting started

**Prerequisites:** Node.js, PostgreSQL 16.

```bash
# 1. Database
createdb tracker_dev

# 2. Backend
cd backend
cp .env.example .env          # set DATABASE_URL + JWT_SECRET
npm install
npx prisma migrate deploy
npm run db:seed               # seeds qa@/dev@/pm@example.com (password: password123)
npm run dev                   # http://localhost:4000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev                   # http://localhost:3000
```

## Running tests

```bash
cd backend
npm run test:unit
npm run test:integration      # needs a tracker_test database

cd ../e2e
npm test                      # boots both servers automatically
```

## Documentation

- [PROGRESS.md](PROGRESS.md) — living roadmap & status
- [BUGS.md](BUGS.md) — bug registry with stats
- [TEST-CASES-auth.md](TEST-CASES-auth.md) — manual QA test cases
