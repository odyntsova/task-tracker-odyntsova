# Feature Report — Hackathon Ticketing System

**Date:** 2026-07-01
**Build under test:** commit `526933c`
**Environment:** Docker stack (`docker compose up --build`) — Postgres 16 + Express API (:4000) + nginx frontend (:8080); macOS (Darwin 25.5.0), Chromium.
**Verification legend:** **A** = automated test · **R** = live runtime check on the running stack · **audit** = code review.
**Regression at time of report:** 56 automated tests green (10 unit / 25 integration / 21 e2e) + live smoke 22/22.

---

## 1. Feature coverage vs. spec

### Authentication & email verification
| Feature | Status | Verified |
|---|---|---|
| Sign up (local), password ≥ 8, Argon2id hash | ✅ | A (integration) · R |
| Login / logout, JWT access + refresh tokens | ✅ | A · R · e2e |
| Email verification via SMTP (relay1.dataart.com) | ✅ | R end-to-end: real email → inbox → verify |
| Unverified user blocked (403 API / redirect on /board) | ✅ | A (integration 403, e2e redirect) · R (401 guard) |
| Verification token: single-use | ✅ | A (integration) · R (real token reused → 400) |
| Verification token: 24h expiry enforced | ✅ | A (integration — expired → 400) |
| Resend invalidates earlier tokens | ✅ | A (integration) |
| Public endpoints only: signup/login/verify/resend | ✅ | A · R · audit |
| Password reset (stretch): forgot → reset → login | ✅ | R (7/7) · A (integration + e2e) |

### Teams (CRUD + rules)
| Feature | Status | Verified |
|---|---|---|
| Create / list / rename | ✅ | A · R · e2e |
| Name non-empty (422) | ✅ | A · R |
| Case-insensitive unique name (409 on duplicate) | ✅ | A · R |
| Delete blocked while it has epics/tickets (409); empty → 204 | ✅ | A · R · e2e |

### Epics (CRUD + rules)
| Feature | Status | Verified |
|---|---|---|
| Create under a team; reject non-existent team (422) | ✅ | A · R |
| Team fixed at creation (teamId ignored on update) | ✅ | A (integration) |
| CRUD screen (create/edit/delete via UI) | ✅ | e2e |
| Delete blocked while referenced by a ticket (409) | ✅ | A · R · e2e |

### Tickets (CRUD + rules)
| Feature | Status | Verified |
|---|---|---|
| Required fields; `createdBy` from token; default state `new` | ✅ | A · R |
| `type` ∈ {bug, feature, fix}; `state` ∈ 5 workflow states | ✅ | A · R (invalid → 422) |
| Epic must belong to the ticket's team (backend-enforced) | ✅ | A · R (cross-team → 422) · e2e |
| State change persists; board ordered by `modifiedAt` desc | ✅ | A |
| `modifiedAt` NOT bumped by comments / no-op saves | ✅ | A · R |
| Delete with confirmation; cascades comments | ✅ | A (cascade) · e2e (confirm dialog) |
| Timestamps ISO-8601 UTC | ✅ | R · audit |

### Kanban board
| Feature | Status | Verified |
|---|---|---|
| Per selected team; exactly 5 columns in workflow order | ✅ | e2e |
| Cards show title + type (epic when set) | ✅ | e2e · audit |
| Drag & drop persists immediately; reverts on failure | ✅ | e2e (persist + forced-500 revert) |
| Filters: type + epic + case-insensitive title search | ✅ | e2e · R (with row counts) |
| Usable with 100+ tickets | ✅ | R (120 tickets, board list median 4 ms) · e2e (120 render + filter) |

### Comments
| Feature | Status | Verified |
|---|---|---|
| Add comment (author + timestamp), chronological oldest-first | ✅ | A · R |
| Empty comment rejected (422) | ✅ | A |
| Edit/delete own comment; non-author → 403 (stretch) | ✅ | A · e2e (controls hidden on others') |

### Persistence, deployment
| Feature | Status | Verified |
|---|---|---|
| All via API + PostgreSQL; migrations applied | ✅ | R (init migration applied) |
| 409 on referenced deletes (referential integrity) | ✅ | A · R · e2e |
| Fresh DB has no seed data | ✅ | R (fresh DB → 0 rows) · audit (0 INSERT in migrations, no seed script) |
| `docker compose up --build` (Docker-only) | ✅ | R (stack runs; nginx proxies /api → backend) |
| Secrets via env only; `.env` gitignored, `.env.example` documented | ✅ | audit |

---

## 2. Stretch features (allowed) — included
- ✅ Password reset (forgot/reset UI + backend, single-use token, revokes refresh tokens)
- ✅ Edit/delete own comments

## 3. Out-of-scope features — correctly **absent** (scope discipline confirmed)
No sprints, burndown, notifications, reporting/dashboards, fine-grained roles/RBAC/admin, ticket priority, assignee, file attachments, or real-time — confirmed by code audit (0 matches) and schema review.

---

## 4. New this session (2026-06-30 → 07-01)
- Real SMTP delivery via relay1.dataart.com wired up and verified end-to-end (commits `4254590`, `23cd21a`).
- Mailer hardened: background send + retry-with-backoff on transient failures (see Bug Report BR-01/BR-02).
- Coverage closed: filter-by-epic + search, 100+ tickets, 5-columns/card-type, epic CRUD UI, ticket-delete confirm, verify-token expiry, epic team-immutability. Regression 45 → **56**.

**Verdict:** every mandatory spec feature is implemented and verified; stretch features present; out-of-scope items absent. No feature-level gaps remain.
