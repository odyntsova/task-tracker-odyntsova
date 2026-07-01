# Bug Report — Hackathon Ticketing System

**Date:** 2026-07-01
**Build under test:** commit `526933c`
**Environment:** Docker stack (Postgres 16 + Express :4000 + nginx :8080), macOS (Darwin 25.5.0), Chromium.
**Scope:** QA effort 2026-06-30 → 07-01 (spec reconciliation, full regression, real-SMTP verification, 100+ load, edge-case exploration).

**Summary:** No new functional defects found in today's regression — 56/56 automated tests and a 22/22 live smoke all pass. Two real defects in the email-delivery path were found earlier in this effort and are **fixed & verified**. Remaining items are known limitations / a deployment gotcha / an ops task, not code defects.

---

## Fixed & verified

### BR-01 — Verification emails silently dropped on transient SMTP failure
**Severity:** High · **Priority:** High · **Status:** ✅ Fixed & verified (commits `4254590`, `23cd21a`)

**Environment:** Backend container sending via `relay1.dataart.com` (real SMTP, no auth).

**Steps to reproduce (before fix):**
1. Configure real SMTP (`SMTP_HOST=relay1.dataart.com`).
2. Sign up (or resend verification) for a `@dataart.com` address.
3. The relay greylists the first attempt with `451 Please try again later`.

**Actual result (before fix):** `sendEmail()` made a single attempt and swallowed the error (`[email] delivery failed`). The verification email was never delivered, so the user could never verify — and, per spec, an unverified user cannot use the app. Silent failure, no retry.

**Expected result:** Transient failures (SMTP 4xx / connection blips) are retried until delivery; a first-attempt greylist does not lose the email.

**Fix:** Delivery moved off the request path and retried with backoff over ~18 min (rides out greylisting). Only transient errors retry; a 5xx hard rejection does not. `isTransient()` unit-tested. Verified live: after the fix a real verification email reached the inbox and the account was verified end-to-end.

---

### BR-02 — Signup/resend request blocked ~39 s on a slow relay
**Severity:** Medium · **Priority:** Medium · **Status:** ✅ Fixed & verified (commit `23cd21a`)

**Steps to reproduce (before fix):** Trigger signup/resend while the relay is slow to accept `DATA`.

**Actual result (before fix):** The email send was `await`ed inside the request handler; a slow relay handshake blocked the HTTP response for ~39 s.

**Expected result:** The endpoint responds immediately (it returns 200 regardless of delivery, to avoid revealing account state).

**Fix:** Email delivery is now fire-and-forget in the background. Measured response after fix: **~52 ms** (was ~39 s).

---

### BR-03 (prior build) — Login crashed the backend on a legacy (non-Argon2id) password hash
**Severity:** Critical · **Status:** ✅ Fixed & verified in a prior build (commit `e27a6b0`), guarded by an integration test. Listed for completeness; re-confirmed green this round.

---

## Open / known items (not code defects)

### BR-04 — Deliverability: default `MAIL_FROM` is spam-flagged; `@dataart.com` From is refused
**Severity:** Low · **Type:** Config / deployment gotcha · **Status:** Documented (`.env.example`)

The DataArt relay **refuses** a `From: …@dataart.com` from an external IP (`550 Administrative prohibition`, anti-spoofing) — so `MAIL_FROM` must be a non-dataart address. The current default `no-reply@ticket-tracker.local` is accepted but Rspamd spam-flags it (fake TLD), so verification mail may land in **Spam**. Recommendation for production: use a real owned sending domain with SPF/DKIM.

### BR-05 — Mail retries are in-memory (no persistent queue)
**Severity:** Low · **Type:** Limitation

Backoff retries (BR-01) live in the process. If the backend restarts mid-backoff, pending retries are lost. Acceptable for the hackathon; a durable outbox/queue would be the production fix. The **Resend verification** button is the user-facing workaround.

### BR-06 — Docker DB contains leftover manual test data
**Severity:** Low · **Type:** Ops / data hygiene · **Status:** Open (decision pending)

The running `tracker` DB holds manually-created data (teams `Team1`/`Team2`/`Payments`, a few epics/tickets/comment). The spec requires a fresh DB to have no data. This is **not** a seed-in-code issue (migrations have zero inserts, no seed script — verified); it is QA-created runtime data. **Action before submission:** clear the DB (or recreate the volume) so a fresh checkout starts empty.

---

## Verdict
No open functional bugs. The two email-path defects (BR-01, BR-02) are fixed and verified; the remaining items are a documented deployment gotcha (BR-04), a known limitation (BR-05), and a pre-submission cleanup task (BR-06).
