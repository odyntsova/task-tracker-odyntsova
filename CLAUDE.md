# Task Tracker — Project Context

A team task tracker application built for a cross-functional team: Developers, Manual QA, QA Automation, and Product Manager.

## Team agents

Use the right subagent for your role:

| Role | Agent | Invoke with |
|------|-------|-------------|
| Developer | `.claude/agents/dev.md` | `use dev agent: ...` |
| Manual QA | `.claude/agents/qa-manual.md` | `use qa-manual agent: ...` |
| QA Automation | `.claude/agents/qa-auto.md` | `use qa-auto agent: ...` |
| Product Manager | `.claude/agents/pm.md` | `use pm agent: ...` |

## Tech stack (planned)

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **Testing**: Jest (unit/integration), Playwright (e2e)
- **CI/CD**: GitHub Actions

## Project structure (target)

```
/
├── frontend/          # React app
├── backend/           # Express API
├── tests/
│   ├── e2e/           # Playwright tests
│   └── integration/   # API integration tests
├── .claude/
│   └── agents/        # Claude Code role agents
└── .github/
    └── workflows/     # CI/CD pipelines
```

## Core user roles

- **Admin**: Full access, manages users and projects
- **Developer**: Creates and updates tasks, manages PRs
- **QA**: Reviews tasks, creates bug reports, verifies fixes
- **PM**: Creates epics/stories, manages backlog and sprints

## Workflow conventions

1. PM writes user story with acceptance criteria
2. QA reviews AC and writes test cases before dev starts
3. Dev implements feature, writes unit tests
4. QA Auto writes e2e tests based on QA's test cases
5. CI runs all tests on every PR
6. Manual QA verifies in staging before merge to main
