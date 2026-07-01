# Regression Report — Hackathon Ticketing System

**Date:** 2026-07-01 (re-run; supersedes the earlier 2026-07-01 run at `526933c`)
**Build under test:** commit `c044db7` + uncommitted Docker→Podman migration (docs/config only; no app code changed)
**Performed by:** QA team (QA-Auto automated suites + QA-Manual checklist)
**Trigger:** Re-run after migrating the container runtime off Docker Desktop to **Podman** (DataArt policy). Confirm suites stay green and the containerized stack still comes up + serves the full flow under Podman.

---

## 1. Automated regression — results

| Suite | Type | Count | Result |
|-------|------|-------|--------|
| `backend` Jest unit | mocked unit | 10 | ✅ all pass |
| `backend` Jest integration | real PostgreSQL | 25 | ✅ all pass |
| `e2e` Playwright (Chromium, real browser) | end-to-end | 21 | ✅ all pass |
| **Total** | | **56** | ✅ green |
| Live smoke (running **Podman** stack) | runtime | ✓ | ✅ all pass |

**Notes from this run:**
- **Runtime migrated to Podman.** Docker Desktop was removed (DataArt policy — Docker Products unapproved). Stack built and run with `podman compose up --build` (Podman 6.0, applehv machine, native `podman-compose` provider). The `Dockerfile`/`docker-compose.yml` are unchanged — standard OCI, portable. No app code changed; only docs/CI comments reworded.
- **Live smoke on the Podman stack — all pass:** images build; `db`+`backend`+`frontend` come up (db healthy); `GET /api/health` 200; frontend serves at :8080; nginx proxies `/api` → backend (200); full flow **signup 201 → email-token → verify 200 → login (JWT) → GET /teams 200 (verified unlock) → POST /teams 201**; fresh DB → 0 rows (no seed).
- Automated suites unchanged from `526933c`: 10 unit + 25 integration + 21 e2e, all green, run against local PostgreSQL (no container needed).
- **Test-env note (not a bug):** a root `.env` sets `SMTP_HOST=relay1.dataart.com`, which `podman compose` loads → the containerized backend uses the *real* SMTP transport, so the verification token is not printed to the console. For a self-contained smoke, run with `SMTP_HOST=` (empty) to use the console transport and read the token from `podman logs`. Real-SMTP delivery via `relay1.dataart.com` + mailer retry/backoff remain covered (BUG-REPORT.md BR-01/BR-02).

---

## 2. Bug report (fixed in this build)

**[BUG] Login crashes the entire backend process when an account has a legacy (non-Argon2id) password hash**

**Severity:** Critical (full server crash / denial of service)
**Priority:** High
**Status:** Fixed & verified (commit `e27a6b0`)

**Environment:**
- Browser: Chrome (latest)
- OS: macOS (Darwin 25.5.0)
- Build/Version: pre-fix backend image; reproduced after the bcrypt→Argon2id switch (commit `7294f53`)

**Steps to reproduce:**
1. Have a user account whose `passwordHash` was created with bcrypt (`$2a$…`), i.e. signed up before the Argon2id switch.
2. Deploy the backend built with Argon2id verification.
3. Submit `POST /api/auth/login` with that account's email and any password.

**Actual result:** `argon2.verify()` throws `Invalid hashed password: salt invalid` on the bcrypt hash. The throw is uncaught in the login route → unhandled promise rejection → the Node process exits. The browser shows `ERR_CONNECTION_REFUSED` for every subsequent request; the whole API is down.

**Expected result:** A non-matching/legacy hash should produce `401 Invalid email or password`. The server must stay up.

**Fix:** `verifyPassword()` wraps `argon2.verify()` in try/catch and treats any failure as a mismatch (401). See [auth.routes.ts](backend/src/routes/auth.routes.ts). Regression test in [auth.integration.test.ts](backend/tests/integration/auth.integration.test.ts).

**Notes:** Root cause is a hash-algorithm migration without backward-compatible verification. For production, a real migration would detect the `$2`/`$argon2` prefix and re-hash on next successful login. Here the dev account was re-hashed to Argon2id directly.

---

## 3. Regression checklist by area

Legend: **[A]** covered by an automated test · **[M]** manual-only check.

### Authentication & email verification
- [x] **[A]** Sign up → "check email" screen, no auto-login
- [x] **[A]** Duplicate email → 409; password < 8 chars → 422
- [x] **[A]** Login with wrong credentials → 401, stays on /login
- [x] **[A]** Login with a legacy/non-argon2 hash → 401, server stays up
- [x] **[A]** Unverified user blocked from business endpoints (403) and from /board (redirect to verify)
- [x] **[A]** Verify with invalid/used token → error; resend invalidates the previous token
- [x] **[A]** Verify with valid token → business endpoints unlock
- [x] **[A]** Password reset (full): forgot → reset → login with new password; old password rejected; token single-use. Backend (integration) + UI pages (e2e).
- [ ] **[M]** Refresh-token rotation: expired access token transparently refreshes; logout invalidates refresh token

### Teams (CRUD)
- [x] **[A]** Create, list, rename
- [x] **[A]** Case-insensitive unique name → 409 on duplicate
- [x] **[A]** Empty name → 422
- [x] **[A]** Delete team with epics/tickets → 409 ("Cannot delete a team…"); empty team → 204

### Epics (CRUD)
- [x] **[A]** Create under a team; reject under non-existent team (422)
- [x] **[A]** Delete epic referenced by a ticket → 409 ("Cannot delete an epic…")
- [x] **[A]** Edit epic title/description persists (e2e epics screen); team fixed on update (integration)

### Tickets (CRUD + rules)
- [x] **[A]** Create with required fields; `createdBy` from token; default state `new`
- [x] **[A]** Invalid type/state or empty body → 422
- [x] **[A]** Epic from a different team → 422
- [x] **[A]** State change persists; board orders by `modifiedAt` desc
- [x] **[A]** No-op save does not advance `modifiedAt`
- [x] **[A]** Delete cascades comments
- [ ] **[M]** Edit ticket via UI updates details and board position

### Kanban board, drag & drop, filters
- [x] **[A]** Board shows 5 state columns per team with counts
- [x] **[A]** Drag card to another column → PATCH persists → survives refresh
- [x] **[A]** Filter by type narrows the board and count
- [x] **[A]** Filter by epic + title search (case-insensitive) via UI
- [x] **[A]** Board usable with 100+ tickets (120 rendered + filter narrows); exactly 5 columns in order; card shows type
- [x] **[A]** Drag failure reverts the card to its original column + shows "Reverted" error (e2e forces a 500 on PATCH)

### Comments
- [x] **[A]** Add comment (author + timestamp), chronological, does not bump ticket `modifiedAt`
- [x] **[A]** Empty comment → 422
- [x] **[A]** Author can edit/delete own comment; non-author → 403 (backend integration)
- [x] **[A]** Edit/delete own comment **via the UI** (e2e handles `prompt`/`confirm` dialogs); edit/delete controls hidden on others' comments

### Security / secrets
- [x] **[M]** No hard-coded password or committed secret; `.env` gitignored, `.env.example` uses placeholders
- [x] **[A]** `/me` never returns `passwordHash`
- [ ] **[M]** SMTP credentials only via env, never logged

### Container runtime / deployment (Podman)
- [x] **[M]** `podman compose up --build` brings up db + backend + frontend; signup→verify→login works
- [x] **[M]** Fresh DB = schema + migrations only, no seed data (verified: 0 teams before create)
- [x] **[M]** Frontend nginx proxies `/api` → backend; reachable at :8080
- [x] **[M]** Runs on approved runtime (Podman); no Docker Desktop / Docker binaries present

---

## 4. High-priority manual test cases

**TC-01: Login no longer crashes the server on a legacy password hash**
Priority: Critical
Preconditions: A user exists whose `passwordHash` is a bcrypt `$2a$…` value (pre-Argon2id account), email verified.
Steps:
1. `POST /api/auth/login` with that email and any password.
2. Immediately afterwards, `GET /api/teams` with a valid token from another verified user.
Expected result: Step 1 returns 401. Step 2 still responds (200/403), proving the backend is alive.
Postconditions: Backend process still running; no crash in logs.

**TC-02: Argon2id account logs in successfully**
Priority: Critical
Preconditions: Verified user whose hash is Argon2id (`$argon2id$…`).
Steps:
1. Open /login, enter correct email + password, submit.
Expected result: 200, tokens issued, redirect to /board.
Postconditions: Session active.

**TC-03: Unverified user cannot reach the board**
Priority: High
Preconditions: Freshly signed-up, unverified user.
Steps:
1. Log in (succeeds) and navigate to /board.
Expected result: Redirected to the "verify needed" page; business endpoints return 403.

**TC-04: Core flow — team → ticket → drag → comment**
Priority: High
Preconditions: Verified user.
Steps:
1. Create a team. 2. Create a bug ticket on the board. 3. Confirm it appears in "New" with count 1. 4. Drag it to "In Progress". 5. Refresh. 6. Open it, add a comment.
Expected result: Each step persists; after refresh the card stays in "In Progress"; comment appears with author + timestamp.

**TC-05: Team deletion blocked while referenced (409)**
Priority: High
Preconditions: A team with at least one epic or ticket.
Steps:
1. On /teams, delete the team.
Expected result: Error message "Cannot delete a team…"; team remains.

**TC-06: Ticket epic must belong to the ticket's team**
Priority: Medium
Preconditions: Two teams A and B; epic under B.
Steps:
1. Create/edit a ticket in team A and try to set epic from team B.
Expected result: 422; ticket not saved with the cross-team epic.

**TC-07: Changing a ticket's team clears the selected epic**
Priority: Medium
Preconditions: Ticket in team A with epic A selected.
Steps:
1. Open the ticket, change Team to B.
Expected result: Epic select resets to "(none)".

**TC-08: Edit/delete own comment (UI) — currently manual-only**
Priority: Medium
Preconditions: Verified user who authored a comment on a ticket.
Steps:
1. On the ticket, click Edit on own comment, change text, confirm. 2. Click Delete, confirm.
Expected result: Edited text replaces the old; delete removes the comment. Edit/Delete controls are absent on other users' comments.

---

## 5. Coverage gaps & recommendations

Closed in this round:
- ✅ Comment edit/delete via UI — new Playwright spec (`comments.spec.ts`) handles `prompt`/`confirm` and asserts controls are hidden on others' comments.
- ✅ Password reset — now end-to-end: forgot/reset **UI pages** (`password-reset.spec.ts`) plus backend integration tests (forgot → reset → login; old password rejected; token single-use). The earlier "API-only, no UI" finding is resolved.
- ✅ Drag-failure revert — new e2e forces a 500 on the PATCH and asserts the card rolls back with a "Reverted" error.

Closed since (2026-07-01):
- ✅ Filter by epic + case-insensitive title search — dedicated e2e added.
- ✅ Board usable with 100+ tickets — runtime measurement (board list median 4 ms on 120) + e2e.
- ✅ Exactly 5 workflow columns in order + card shows type — e2e.
- ✅ Epic CRUD screen via UI; ticket delete confirmation dialog — e2e.
- ✅ Verify-token 24h expiry + epic team-immutability — integration.
- ✅ Real SMTP (relay1.dataart.com) end-to-end + mailer retry/backoff.

Verified this round:
- ✅ Container runtime migrated Docker Desktop → **Podman**; full stack builds and runs the complete flow under `podman compose`.

Remaining (not regressions):
1. Refresh-token rotation / logout invalidation — manual-only, not yet automated.
2. Pre-submission: clear the compose DB of manually-created smoke data (see BUG-REPORT.md BR-06).
3. Root `.env` carries `SMTP_HOST=relay1.dataart.com`; unset it for a self-contained (console-transport) container smoke.

**Verdict:** Build passes full regression — **56 automated tests green** (10 unit + 25 integration + 21 e2e) plus a full live smoke on the running **Podman** stack (build → up → health → signup→verify→login→create-team → fresh-DB). Runtime migration to Podman introduced no regressions; no app code changed. Every mandatory spec item covered; no open blockers.
