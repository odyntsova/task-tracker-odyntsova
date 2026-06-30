# Progress Tracker

Журнал виконаного та відкладеного по проекту Task Tracker.
Принцип: відразу все зробити неможливо — фіксуємо що готово, що в роботі, що на потім.

_Останнє оновлення: 2026-06-30_

---

## ✅ Зроблено

### Інфраструктура агентів
- [x] 4 Claude Code subagents у `.claude/agents/`: `dev`, `qa-manual`, `qa-auto`, `pm`
- [x] `CLAUDE.md` — контекст проекту для всієї команди
- [x] GitHub Actions CI/CD pipeline (`.github/workflows/ci.yml`): lint → unit → integration → e2e

### Backend (`backend/`)
- [x] Скафолд: Express + TypeScript + Prisma
- [x] Prisma-схема: User, Project, Task, Sprint
- [x] Auth middleware: `requireAuth`, `requireRole`
- [x] Роути: auth (register/login/me/logout), projects (CRUD + nested tasks), tasks (get/patch/delete)
- [x] RBAC застосовано: матриця прав у `src/permissions.ts`, requireRole на деструктивних роутах
- [x] Залежності встановлено, Jest налаштовано

### Frontend (`frontend/`)
- [x] Скафолд: React + TypeScript + Vite
- [x] Спільні типи, axios API-клієнт з інтерсепторами
- [x] Сторінки: Login, Dashboard, Tasks (всі з `data-testid` для автотестів)
- [x] Routing з PrivateRoute

### Тестування
- [x] 49 юніт-тестів (мок Prisma): auth (18), tasks (14), projects (17) — 3 сьюти
- [x] Знайдено та виправлено 2 баги + закрито вектор privilege escalation (див. BUGS.md)

### Локальний запуск (SQLite)
- [x] Prisma переведено на SQLite для dev (enums → String — обмеження SQLite)
- [x] Seed-скрипт зі стартовими юзерами та проектом (`prisma/seed.ts`)
- [x] Backend (:4000) + frontend (:3000) піднімаються, проксі /api працює
- [x] Логін перевірено end-to-end проти живої БД (200 / 401 / 422 + BUG-1/BUG-2 фікси)
- [x] Стартові креди: `qa@example.com` / `dev@example.com`, пароль `password123`

---

## 🗺️ Роадмеп (повний обсяг)

Загальна готовність продукту: **~85%** (48/53 тікети). Auth (повний end-to-end), Tasks, Sprints (+ Kanban + burndown) — повні зрізи + rate limiting + PostgreSQL + RBAC. 209 автотестів (135 unit + 43 integration + 31 e2e), усі зелені на Postgres.
Обсяг: S = до пів дня, M = 1-2 дні, L = 3-5 днів, XL = тиждень+.

Статуси: ⬜ to do · 🔄 in progress · ✅ done

---

### EPIC 1 — Auth & Security · готовність 100%
| ID | Тікет | Пріоритет | Обсяг | Статус |
|----|-------|-----------|-------|--------|
| AUTH-1 | Роут логіну + юніт-тести | High | M | ✅ |
| AUTH-2 | Роут реєстрації (lowercase email, anti-privilege-escalation) | High | M | ✅ |
| AUTH-3 | Refresh-токени (DB-backed, ротація, 7 днів) + POST /auth/refresh — `tokens.ts` | Medium | M | ✅ |
| AUTH-4 | Logout відкликає refresh-токен (revokedAt); reuse → 401 | Medium | S | ✅ |
| AUTH-5 | Rate limiting на /login та /register (in-memory, 429) — `middleware/rateLimit.ts` | Medium | S | ✅ |
| AUTH-6 | Скидання пароля: forgot/reset (PasswordResetToken, email-токен, revoke сесій, одноразовий) | Low | L | ✅ |
| AUTH-7 | Підтвердження email: EmailVerificationToken, токен при register, POST /verify-email | Low | M | ✅ |

### EPIC 2 — Tasks & Projects API · готовність 100%
| ID | Тікет | Пріоритет | Обсяг | Статус |
|----|-------|-----------|-------|--------|
| TASK-1 | CRUD-роути tasks та projects | High | M | ✅ |
| TASK-2 | Юніт-тести на tasks/projects (25 тестів: auth guard, 404, пагінація, валідація) | High | M | ✅ |
| TASK-3 | Валідація переходів статусів — `src/taskStatus.ts` (state machine) | Medium | M | ✅ |
| TASK-4 | Призначення задач + перевірка існування юзера (422 якщо нема) | Medium | S | ✅ |
| TASK-5 | Фільтри (status/priority/assignee/unassigned) + пошук + сортування + фікс meta.total | Medium | M | ✅ |
| TASK-6 | Коментарі до задач: GET/POST /tasks/:id/comments + TaskDetailPage | Low | M | ✅ |
| TASK-7 | Історія змін задачі (TaskActivity): запис у PATCH + GET /tasks/:id/activity + UI | Low | L | ✅ |
| TASK-8 | `GET /api/users` (для дропдаунів assignee, без passwordHash) | Medium | S | ✅ |

### EPIC 3 — RBAC (ролі та права) · готовність 100%
| ID | Тікет | Пріоритет | Обсяг | Статус |
|----|-------|-----------|-------|--------|
| RBAC-1 | Middleware `requireRole` написано | High | S | ✅ |
| RBAC-2 | Застосувати requireRole до роутів (POST /projects, DELETE /tasks → ADMIN/PM) | High | M | ✅ |
| RBAC-3 | Матриця прав по ролях — `src/permissions.ts` | High | S | ✅ |
| RBAC-4 | Тести на permission boundaries (403 для DEVELOPER/QA) + e2e перевірка | High | M | ✅ |
| RBAC-5 | Адмін-панель: PATCH /users/:id/role (ADMIN-only, no self-change) + AdminPage (role-gated) | Medium | L | ✅ |
| RBAC-6 | Тільки creator/assignee/ADMIN/PM може редагувати задачу (`canEditTask`) — 403 для решти | Medium | M | ✅ |

### EPIC 4 — Frontend · готовність ~75%
| ID | Тікет | Пріоритет | Обсяг | Статус |
|----|-------|-----------|-------|--------|
| FE-1 | Login + Dashboard + Tasks (перегляд) | High | M | ✅ |
| FE-2 | Сторінка реєстрації + лінки login↔register | High | S | ✅ |
| FE-3 | Форма створення задачі + інлайн-зміна статусу | High | M | ✅ |
| FE-4 | Фільтри (статус/пріоритет/assignee/пошук) + інлайн зміна статусу/пріоритету/assignee | Medium | M | ✅ |
| FE-5 | Глобальний state (auth context, поточний юзер) | Medium | M | ⬜ |
| FE-6 | Обробка помилок/лоадерів консистентно | Medium | S | ⬜ |
| FE-7 | Адаптивна верстка + базовий дизайн | Low | L | ⬜ |
| FE-8 | UI спринтів: SprintsPage (список+створення, role-gated) + дропдаун спринта на задачі | Medium | M | ✅ |
| FE-9 | Kanban-дошка (KanbanPage) — колонки за статусом, drag&drop, нав-лінки | Medium | M | ✅ |
| FE-10 | Авто-рефреш access-токена на 401 (single-flight) + logout-кнопка + зберігання refresh | Medium | M | ✅ |
| FE-11 | Burndown-сторінка: SVG-графік (ideal vs remaining, без залежностей) + таблиця даних | Low | M | ✅ |

### EPIC 5 — Kanban & Sprints · готовність ~95%
| ID | Тікет | Пріоритет | Обсяг | Статус |
|----|-------|-----------|-------|--------|
| SPRINT-1 | API спринтів: POST/GET /projects/:id/sprints (RBAC PM) + GET /sprints/:id з задачами, валідація дат | Medium | M | ✅ |
| SPRINT-2 | Kanban-дошка з нативним drag&drop (колонки за статусом, відкат нелегальних переходів) | Medium | L | ✅ |
| SPRINT-3 | Додавання/винесення задач у спринт (PATCH task.sprintId) + захист від крос-проектного спринта | Low | M | ✅ |
| SPRINT-4 | Burndown chart: Task.completedAt + GET /sprints/:id/burndown + SVG-графік на фронті | Low | M | ✅ |

### EPIC 6 — Notifications · готовність 100%
| ID | Тікет | Пріоритет | Обсяг | Статус |
|----|-------|-----------|-------|--------|
| NOTIF-1 | Нотифікації при призначенні задачі (in-app, skip self) | Low | M | ✅ |
| NOTIF-2 | Нотифікації при зміні статусу (для assignee) | Low | S | ✅ |
| NOTIF-3 | Email-доставка: pluggable mailer (console dev, SMTP-ready) + email на assignment/status | Low | L | ✅ |
| NOTIF-4 | API + UI: GET /notifications (+unread), mark read/read-all, панель на Dashboard | Low | M | ✅ |

### EPIC 7 — Reporting · готовність ~90%
| ID | Тікет | Пріоритет | Обсяг | Статус |
|----|-------|-----------|-------|--------|
| REP-1 | Метрики виконання задач (total/completed/rate, byStatus, byPriority) | Low | M | ✅ |
| REP-2 | Velocity по спринтах (DONE per sprint) | Low | M | ✅ |
| REP-3 | ReportPage: метрики + розбивка по статусах + velocity-бари | Low | L | ✅ |

### EPIC 8 — Testing & QA infrastructure · готовність ~95%
| ID | Тікет | Пріоритет | Обсяг | Статус |
|----|-------|-----------|-------|--------|
| QA-1 | Юніт-тести (135, 8 сьют): auth (вкл. refresh), tasks, projects, users, sprints, RBAC, transitions, filters, sprint-assign, rate-limit | High | M | ✅ |
| QA-2 | Seed-скрипт тестових даних | Medium | S | ✅ |
| QA-3 | CI pipeline (lint/unit/integration/e2e) | High | M | ✅ |
| QA-4 | Integration-тести проти реальної PostgreSQL БД (43 тести: + activity) | High | M | ✅ |
| QA-5 | Playwright e2e (31 тест): + activity | Medium | L | ✅ |
| QA-6 | Мануальні тест-кейси на auth-слайс — `TEST-CASES-auth.md` (33 TC + regression) | Medium | M | ✅ |
| QA-7 | Coverage-пороги 80% у jest.config + enforced у CI (backend-scoped job); поточно ~97% | Low | S | ✅ |

### EPIC 9 — DevOps & Production-readiness · готовність ~55%
| ID | Тікет | Пріоритет | Обсяг | Статус |
|----|-------|-----------|-------|--------|
| OPS-1 | Перехід на PostgreSQL 16 завершено: enum-типи відновлено, міграція застосована, 126 тестів зелені на Postgres. SQLite-варіант → `schema.sqlite.prisma` | Medium | M | ✅ |
| OPS-2 | Справжні env-секрети (JWT_SECRET зараз плейсхолдер) | High | S | ⬜ |
| OPS-3 | Dockerfile (backend multi-stage + frontend/nginx) + docker-compose (db+api+web) | Low | M | ✅ |
| OPS-4 | Деплой pipeline (staging/prod) | Low | L | ⬜ |
| OPS-5 | Логування та моніторинг | Low | M | ⬜ |

---

## 🎯 Рекомендований порядок (наступний спринт)
1. ~~**TASK-2** — тести на tasks/projects~~ ✅
2. ~~**RBAC-2 + RBAC-3 + RBAC-4** — застосувати ролі~~ ✅
3. ~~**FE-2 + FE-3** — реєстрація та форма задач на фронті~~ ✅
4. ~~**QA-5** — Playwright e2e на базі TEST-CASES-auth.md~~ ✅ (знайшов BUG-3)
5. ~~**QA-4** — integration-тести проти реальної тестової БД~~ ✅
6. ~~**TASK-3 / TASK-4** — переходи статусів + призначення задач~~ ✅
7. ~~**TASK-5** — фільтри/сортування/пошук задач~~ ✅
8. ~~**FE-4** — UI для фільтрів/assignee/пріоритету~~ ✅ (+ новий GET /api/users)
9. ~~**QA-5 розширення** — Playwright e2e на фільтри/призначення~~ ✅
10. ~~**SPRINT-1** — API спринтів~~ ✅
11. ~~**SPRINT-3** — додавання задач у спринт~~ ✅
12. ~~**FE спринтів** — UI створення/перегляду спринтів і призначення задач~~ ✅
13. ~~**SPRINT-2** — Kanban-дошка (drag&drop)~~ ✅
14. ~~**AUTH-5** — rate limiting~~ ✅
15. ~~**OPS-1** — перехід на PostgreSQL~~ ✅
16. ~~**RBAC-6** — ownership на редагування задач~~ ✅
17. ~~**AUTH-3** refresh-токени + **AUTH-4** logout-revocation~~ ✅
18. ~~FE авто-рефреш на 401~~ ✅
19. ~~**SPRINT-4** burndown chart~~ ✅
20. ~~**Notifications** (NOTIF-1/2/4)~~ ✅
21. ~~**Reporting** епік (REP-1/2/3)~~ ✅
22. ~~**OPS-3** Dockerfile/compose~~ ✅ (написано; локально не збиралось — Docker не встановлено в dev-середовищі)
23. ~~**RBAC-5** адмін-панель~~ ✅ (EPIC RBAC 100%)
24. ~~**TASK-6** коментарі~~ ✅
25. ~~**QA-7** coverage-пороги~~ ✅ (EPIC Testing ~95%)
26. ~~NOTIF-3 email~~ ✅ (EPIC Notifications 100%)
27. Далі: AUTH-6 reset password, TASK-7 audit log, FE-7 дизайн, OPS-4 деплой 👈 наступне

---

## 📝 Нотатки / технічний борг
- ~~**RBAC не застосований**~~ ✅ Закрито: `requireRole` застосовано до POST /projects та DELETE /tasks (ADMIN/PM). Матриця прав у `src/permissions.ts`. Наступний крок поглиблення — RBAC-6 (тільки assignee/creator редагує задачу).
- ~~Немає Postgres — dev на SQLite~~ ✅ Закрито (OPS-1): dev і тести працюють на PostgreSQL 16 (`tracker_dev` / `tracker_test`). Запуск БД: `/opt/homebrew/opt/postgresql@16/bin/pg_ctl -D /opt/homebrew/var/postgresql@16 start`. SQLite-схема лишилась як fallback (`schema.sqlite.prisma`).
- `JWT_SECRET` поки плейсхолдер — замінити перед продакшеном (OPS-2).
- Logout-роут — заглушка, токен не інвалідується (AUTH-4).
- Дрібна неконсистентність API: у `POST /projects/:id/tasks` перевірка існування проекту йде до валідації тіла → невалідне тіло на неіснуючому проекті повертає 404, а не 422. Не баг, але варто узгодити порядок при рефакторингу.
- ~~Пошук `?q=` чутливий до регістру (SQLite)~~ ✅ На Postgres увімкнено `mode: 'insensitive'` — пошук без урахування регістру.
- Rate limiter (AUTH-5) — in-memory, per-process. Для multi-instance prod винести в Redis.
- **OPS-3 (Docker) написано, але не зібрано локально** — Docker не встановлено в dev-середовищі. Файли (backend/frontend Dockerfile, nginx.conf, docker-compose.yml) провалідовані лише статично. Перед деплоєм: `docker compose up --build` на машині з Docker.
- БД-міграції тепер версіонуються у `backend/prisma/migrations/` (Postgres). Деплой: `prisma migrate deploy` (вже є в CI-шаблоні).
