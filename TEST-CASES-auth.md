# Test Cases — Authentication & Authorization slice

Підготовлено за форматом `qa-manual` агента. Слайс готовий до тестування (handoff від розробки).

**Середовище:** http://localhost:3000 (frontend) · http://localhost:4000 (backend) · SQLite (dev)
**Сіяні юзери:** `qa@example.com` (QA), `dev@example.com` (DEVELOPER) — пароль `password123`
**Покриває:** реєстрацію, логін, авторизацію (RBAC), фронт-форми.

---

## 1. Реєстрація (POST /api/auth/register)

**TC-001: Успішна реєстрація нового юзера**
Priority: Critical
Preconditions: email не зареєстрований
Steps:
1. Відкрити /register
2. Ввести name, валідний email, пароль ≥8 символів
3. Натиснути "Create account"
Expected result: 201, JWT збережено, редірект на dashboard, роль = DEVELOPER
Postconditions: юзер у БД з email у нижньому регістрі

**TC-002: Email зберігається у lowercase**
Priority: High
Steps:
1. Зареєструватись з email `Mixed@Example.COM`
Expected result: 201; у БД та у відповіді email = `mixed@example.com`

**TC-003: Спроба задати роль через тіло запиту (privilege escalation)**
Priority: Critical
Steps:
1. POST /api/auth/register з body, що містить `"role":"ADMIN"`
Expected result: 201, але роль створеного юзера = DEVELOPER (поле role проігноровано)

**TC-004: Дублікат email**
Priority: High
Preconditions: `qa@example.com` вже існує
Steps:
1. Зареєструватись з `qa@example.com` (або тим самим email в іншому регістрі)
Expected result: 409, error "Email already registered", новий юзер не створений

**TC-005: Закороткий пароль (<8)**
Priority: High
Steps:
1. Реєстрація з паролем `abc`
Expected result: 422 (бекенд) / валідація форми не пускає (фронт, minLength=8)

**TC-006: Невалідний email**
Priority: Medium
Steps:
1. Реєстрація з email `not-an-email`
Expected result: 422, юзер не створений

**TC-007: Відсутнє ім'я**
Priority: Medium
Steps:
1. POST register без поля name
Expected result: 422

**TC-008 (boundary): Пароль рівно 8 та рівно 72 символи**
Priority: Medium
Expected result: обидва приймаються (201)

---

## 2. Логін (POST /api/auth/login)

**TC-010: Успішний логін**
Priority: Critical
Steps:
1. /login → `qa@example.com` / `password123` → Sign in
Expected result: 200, JWT збережено, редірект на dashboard

**TC-011: Логін нечутливий до регістру email**
Priority: High
Steps:
1. Логін з `QA@Example.com` / `password123`
Expected result: 200 (email лоуэркейситься перед пошуком)

**TC-012: Неправильний пароль**
Priority: Critical
Expected result: 401, error "Invalid email or password", без JWT

**TC-013: Неіснуючий юзер**
Priority: High
Expected result: 401 (те саме повідомлення — не розкриваємо, що email не існує)

**TC-014: Пароль > 72 символів**
Priority: Medium
Expected result: 422

**TC-015: passwordHash не повертається клієнту**
Priority: Critical (security)
Steps:
1. Будь-який успішний логін, перевірити тіло відповіді
Expected result: об'єкт user НЕ містить поля passwordHash

---

## 3. Авторизація / RBAC

**TC-020: Доступ без токена**
Priority: Critical
Steps:
1. GET /api/projects без Authorization
Expected result: 401 Unauthorized

**TC-021: DEVELOPER не може створити проект**
Priority: Critical
Steps:
1. Логін як dev@example.com
2. POST /api/projects
Expected result: 403 Forbidden, проект не створено

**TC-022: DEVELOPER не може видалити задачу**
Priority: Critical
Steps:
1. DELETE /api/tasks/:id під DEVELOPER
Expected result: 403, задача на місці

**TC-023: DEVELOPER МОЖЕ оновити задачу**
Priority: High
Expected result: 200 (оновлення дозволене всім залогіненим)

**TC-024: ADMIN/PM можуть створювати проекти й видаляти задачі**
Priority: High
Expected result: 201 / 204 відповідно

**TC-025: Прострочений/підроблений токен**
Priority: High
Steps:
1. Запит з невалідним JWT
Expected result: 401 "Invalid or expired token"

---

## 4. Frontend форми

**TC-030: Перехід між login ↔ register**
Priority: Medium
Steps:
1. /login → клік "Create one" → /register → клік "Sign in" → /login
Expected result: навігація працює в обидва боки

**TC-031: Повідомлення про помилку на формі реєстрації**
Priority: Medium
Steps:
1. Зареєструватись з уже зайнятим email
Expected result: видиме повідомлення "This email is already registered"

**TC-032: Редірект залогіненого юзера з /login**
Priority: Low
Steps:
1. Маючи токен, відкрити захищену сторінку
Expected result: доступ; без токена — редірект на /login (PrivateRoute)

**TC-033: Стан кнопки під час сабміту**
Priority: Low
Expected result: кнопка disabled + текст "Signing in…"/"Creating…" під час запиту

---

## 🔁 Regression checklist (auth slice)

- [ ] Логін правильними кредами → dashboard
- [ ] Логін у різному регістрі email
- [ ] Логін неправильним паролем → 401
- [ ] Реєстрація нового юзера → роль DEVELOPER
- [ ] Дублікат email → 409
- [ ] role:ADMIN у body ігнорується
- [ ] passwordHash не тече у відповідь
- [ ] Без токена → 401, без прав → 403
- [ ] DEVELOPER: create project / delete task → 403
- [ ] ADMIN/PM: create project / delete task → ОК
- [ ] Навігація login ↔ register
- [ ] PrivateRoute редіректить неавторизованих

---

## 📌 Нотатки для розробки
- Усі форми мають `data-testid` — готові до автоматизації (передати qa-auto для Playwright, тікет QA-5).
- TC-003, TC-015, TC-020..TC-022 — найкритичніші (security). Прогонити першими.

---

## 5. Tasks page — фільтри та інлайн-редагування (FE-3/FE-4)

Автоматизовано в `e2e/specs/tasks.spec.ts` (14 e2e всього з auth).

**TC-040: Створення задачі через форму**
Priority: High
Expected result: нова задача зʼявляється у списку

**TC-041: Пошук по заголовку**
Priority: Medium
Steps: ввести підрядок у фільтр пошуку
Expected result: лишаються тільки задачі, чий заголовок містить підрядок

**TC-042: Фільтр по пріоритету / статусу**
Priority: Medium
Expected result: список звужується до обраного значення

**TC-043: Інлайн-зміна статусу зберігається після reload**
Priority: High
Expected result: змінений статус лишається після перезавантаження сторінки

**TC-044: Інлайн-призначення виконавця + фільтр по assignee**
Priority: High
Expected result: після призначення задача показується у фільтрі по цьому виконавцю

**TC-045: Фільтр "Unassigned"**
Priority: Medium
Expected result: показуються лише задачі без виконавця
