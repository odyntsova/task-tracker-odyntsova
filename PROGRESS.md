# Progress Tracker — aligned to the Hackathon Ticketing System spec

Source of truth: `Hackathon_Ticketing_System_Requirements_v3` (fixed scope).
Earlier work diverged (built out-of-scope sprints/notifications/reporting/RBAC and missed Teams/Epics/Ticket type). As of 2026-06-30 the codebase is being realigned to spec.

_Last updated: 2026-06-30_

---

## Definition of Done (from the spec) — status

| # | Requirement | Backend | Frontend |
|---|-------------|---------|----------|
| 1 | Sign up → email verification (SMTP) → verify → log in | ✅ | ✅ |
| 2 | Teams managed via UI, persisted | ✅ | ✅ |
| 3 | Epics managed via UI, persisted (incl. edit) | ✅ | ✅ |
| 4 | Tickets: create/view/edit/delete | ✅ | ✅ |
| 5 | Comments with author + timestamp | ✅ | ✅ |
| 6 | Kanban shows tickets in 5 state columns per team | ✅ | ✅ |
| 7 | Drag to another column updates server, survives refresh | ✅ | ✅ (e2e) |
| 8 | `docker compose up --build` from repo root | 🔄 config done; not run here (no Docker) |
| 9 | No hard-coded password / committed secret | ✅ |
| 10 | Fresh DB = schema + migrations only, no seed | ✅ |
| 11 | QA creates all data via UI/API | ✅ |

**Tests:** 6 unit + 19 integration (PostgreSQL) + 7 Playwright e2e — all green.

---

## Backend — realigned ✅ (6 unit + 19 integration green on PostgreSQL)

- **Schema**: User, Team, Epic, Ticket (type `bug|feature|fix`, state `new|ready_for_implementation|in_progress|ready_for_acceptance|done`, body required, createdBy, modifiedAt), Comment (cascade on ticket delete), token tables. Out-of-scope models removed (Project/Sprint/Notification/TaskActivity/role/priority/assignee).
- **Auth**: signup (no auto-login), login, `/me`, logout, refresh; **email verification enforced** (`requireVerified` → 403 until verified); resend invalidates prior tokens; tokens 24h single-use; password ≥8 bcrypt; SMTP via nodemailer (console fallback in dev/test).
- **Teams**: CRUD, case-insensitive unique names, **409** on delete with tickets/epics.
- **Epics**: per-team (team fixed at creation), CRUD, **409** when referenced by tickets.
- **Tickets**: board list by team (filters type/epic + title search, modifiedAt desc), CRUD; **epic must belong to the ticket team** (422); **modifiedAt not advanced on no-op save**; delete cascades comments.
- **Comments**: per ticket, non-empty, chronological, **do not bump ticket modifiedAt**.
- Middleware kept: request logging, rate limiting.

---

## 🔜 Remaining

### Phase 8 — Frontend rebuild ✅
- [x] API client + types → new endpoints; old domain removed
- [x] Screens: sign-up, email-verification result, resend, login
- [x] Kanban board: team selector, 5 columns + counts, type/epic filters + title search; dnd persists + reverts on error
- [x] Ticket create/edit/details (+ comments, delete-with-confirm)
- [x] Team management + Epic management (full CRUD)

### Phase 9 — Compose / docs / e2e
- [x] README rewritten to spec; docker-compose SMTP env wired; fresh DB no seed
- [x] Playwright e2e rewritten (auth UI flows + core verified-user flow + filters)
- [x] `docker compose up --build` run on a Docker host (verified by the user — full stack up, signup→verify→login works)

---

## Beyond mandatory
- **Argon2id** password hashing (spec's named algorithm) ✅
- Password reset (forgot/reset) — backend + **UI pages** (e2e covered) ✅
- Edit/delete own comments ✅
- Email verification auto-redirect to login + success states (loading/empty/error/success) ✅
- Large boards: per-column scroll keeps 100+ tickets usable ✅ (full windowing intentionally skipped — conflicts with simple HTML5 DnD, marginal value)
- Ticket activity history — removed in realignment (out of scope per §12)

## Notes
- CI workflow still partly templated for old layout — revisit after FE.
- Postgres dev: `/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 start`; DBs `tracker_dev` / `tracker_test`.
