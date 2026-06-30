# Progress Tracker — aligned to the Hackathon Ticketing System spec

Source of truth: `Hackathon_Ticketing_System_Requirements_v3` (fixed scope).
Earlier work diverged (built out-of-scope sprints/notifications/reporting/RBAC and missed Teams/Epics/Ticket type). As of 2026-06-30 the codebase is being realigned to spec.

_Last updated: 2026-06-30_

---

## Definition of Done (from the spec) — status

| # | Requirement | Backend | Frontend |
|---|-------------|---------|----------|
| 1 | Sign up → email verification (SMTP) → verify → log in | ✅ | ⬜ |
| 2 | Teams managed via UI, persisted | ✅ API | ⬜ |
| 3 | Epics managed via UI, persisted | ✅ API | ⬜ |
| 4 | Tickets: create/view/edit/delete | ✅ API | ⬜ |
| 5 | Comments with author + timestamp | ✅ API | ⬜ |
| 6 | Kanban shows tickets in 5 state columns per team | ✅ data | ⬜ |
| 7 | Drag to another column updates server, survives refresh | ✅ PATCH | ⬜ |
| 8 | `docker compose up --build` from repo root | 🔄 needs spec-update + test |
| 9 | No hard-coded password / committed secret | ✅ |
| 10 | Fresh DB = schema + migrations only, no seed | ✅ (seed removed) |
| 11 | QA creates all data via UI/API | ⬜ (needs FE) |

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

### Phase 8 — Frontend rebuild (to spec)
- [ ] API client → new endpoints; drop tasks/projects/sprints/notifications/reporting
- [ ] Screens: sign-up, email-verification result, resend, login
- [ ] Kanban board: **team selector**, 5 columns, type+epic filters + title search, counts; dnd persists + reverts on error
- [ ] Ticket create/edit/details (+ comments)
- [ ] Team management screen
- [ ] Epic management screen
- [ ] Remove old pages (Sprints/Burndown/Report/Admin/Dashboard-as-projects)

### Phase 9 — Compose / docs / e2e
- [ ] `docker compose up --build` from root verified; SMTP env (`relay1.dataart.com`); fresh DB no seed
- [ ] README: prerequisites, configuration, startup
- [ ] Rewrite Playwright e2e for new flows; drop old-domain specs

---

## Stretch (allowed, present)
- Password reset (forgot/reset) ✅
- Edit/delete own comments — not done
- Ticket activity history — removed in realignment; can re-add

## Notes
- CI workflow still partly templated for old layout — revisit after FE.
- Postgres dev: `/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 start`; DBs `tracker_dev` / `tracker_test`.
