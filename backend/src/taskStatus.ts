// Allowed task status transitions (a simple workflow state machine).
//
//   TODO ──▶ IN_PROGRESS ──▶ IN_REVIEW ──▶ DONE
//     ▲          │  ▲            │           │
//     │          ▼  │            ▼           │
//     └──────  BLOCKED ◀─────────┘           │
//                            (reopen) ◀──────┘
//
// Rules of thumb:
// - You cannot jump straight from TODO to DONE (work must pass through review).
// - DONE can only be reopened to IN_PROGRESS, never silently back to TODO.
// - Anything in flight can be BLOCKED; a BLOCKED task resumes to TODO/IN_PROGRESS.

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' | 'BLOCKED'

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['IN_REVIEW', 'BLOCKED', 'TODO'],
  IN_REVIEW: ['DONE', 'IN_PROGRESS', 'BLOCKED'],
  BLOCKED: ['TODO', 'IN_PROGRESS'],
  DONE: ['IN_PROGRESS'],
}

/**
 * Returns true if a task may move from `from` to `to`.
 * A no-op (same status) is always allowed so an idempotent PATCH never fails.
 */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true
  return TRANSITIONS[from].includes(to)
}
