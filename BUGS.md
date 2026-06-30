# Bug Tracker

Реєстр багів проекту Task Tracker для баг-репортингу та статистики.

_Останнє оновлення: 2026-06-30_

---

## 📊 Статистика

| Метрика | Значення |
|---------|----------|
| Усього знайдено | 3 |
| Відкрито | 0 |
| Виправлено | 3 |
| Закрито (verified) | 3 |

**За severity:**
| Severity | Знайдено | Відкрито |
|----------|----------|----------|
| Critical | 0 | 0 |
| Major    | 2 | 0 |
| Minor    | 1 | 0 |
| Trivial  | 0 | 0 |

**За компонентом:**
| Компонент | Кількість |
|-----------|-----------|
| Auth      | 2 |
| Tasks     | 0 |
| Projects  | 0 |
| Frontend  | 1 |

---

## 🐞 Список багів

### BUG-1 — Логін чутливий до регістру email
- **Severity:** Major
- **Priority:** High
- **Component:** Auth
- **Status:** ✅ Closed (verified)
- **Знайдено:** 2026-06-30 (юніт-тестування логіну)
- **Виправлено:** 2026-06-30

**Опис:** Email передавався в `findUnique` без нормалізації. Юзер, що зареєструвався як `qa@example.com`, не міг увійти, ввівши `QA@example.com`.

**Кроки відтворення:**
1. Зареєструватись з email у нижньому регістрі
2. Спробувати увійти з тим самим email в іншому регістрі
3. Логін провалюється (401)

**Очікувано:** Email нечутливий до регістру.
**Фактично (до фіксу):** 401 Invalid email or password.

**Фікс:** `.toLowerCase()` у zod-схемі — [auth.routes.ts:13](backend/src/routes/auth.routes.ts#L13)
**Regression guard:** тест "normalises the email to lowercase before the DB lookup"
**⚠️ Пов'язаний ризик:** роут реєстрації (ще не існує) теж має зберігати email у lowercase.

---

### BUG-2 — Немає верхньої межі довжини пароля
- **Severity:** Minor
- **Priority:** Medium
- **Component:** Auth
- **Status:** ✅ Closed (verified)
- **Знайдено:** 2026-06-30 (юніт-тестування логіну)
- **Виправлено:** 2026-06-30

**Опис:** Схема логіну не обмежувала довжину пароля. bcrypt мовчки обрізає пароль до 72 байт; наддовгі паролі — потенційний DoS-вектор (дорогий хешинг).

**Кроки відтворення:**
1. Надіслати POST /api/auth/login з паролем у 500+ символів
2. Запит проходить валідацію та доходить до bcrypt

**Очікувано:** 422 на занадто довгий пароль.
**Фактично (до фіксу):** Запит обробляється, bcrypt порівнює тільки перші 72 байти.

**Фікс:** `.max(72)` у zod-схемі — [auth.routes.ts:14](backend/src/routes/auth.routes.ts#L14)
**Regression guard:** тести "rejects a password longer than 72 bytes" + boundary "exactly 72 bytes"

---

### BUG-3 — Помилка логіну не показується (глобальний 401-інтерсептор перехоплює)
- **Severity:** Major
- **Priority:** High
- **Component:** Frontend
- **Status:** ✅ Closed (verified)
- **Знайдено:** 2026-06-30 (Playwright e2e, TC-012)
- **Виправлено:** 2026-06-30

**Опис:** Глобальний axios response-інтерсептор на будь-яку відповідь 401 робив `window.location.href = '/login'`. При неправильному паролі бекенд повертає 401 → інтерсептор перезавантажував сторінку логіну ще до того, як форма встигала відрендерити повідомлення про помилку. Користувач ніколи не бачив "Invalid email or password" — лише мовчазне перезавантаження.

**Кроки відтворення:**
1. Відкрити /login
2. Ввести правильний email і неправильний пароль → Sign in
3. Спостерігати: сторінка перезавантажується, повідомлення про помилку відсутнє

**Очікувано:** На формі видно "Invalid email or password", URL лишається /login.
**Фактично (до фіксу):** Тихий редірект/перезавантаження, помилка не показана.

**Середовище:** Chromium (Playwright), localhost:3000
**Фікс:** інтерсептор пропускає редірект для запитів до `/auth/login` та `/auth/register` — [api.ts:17-29](frontend/src/services/api.ts#L17-L29)
**Regression guard:** e2e TC-012 "wrong password shows an error and stays on /login"

---

## 📋 Шаблон для нового бага

```
### BUG-N — Короткий заголовок
- **Severity:** Critical / Major / Minor / Trivial
- **Priority:** High / Medium / Low
- **Component:** Auth / Tasks / Projects / Frontend / ...
- **Status:** 🆕 New / 🔧 In Progress / ✅ Fixed / ✅ Closed / ❌ Won't Fix
- **Знайдено:** YYYY-MM-DD
- **Виправлено:** YYYY-MM-DD

**Опис:** ...

**Кроки відтворення:**
1. ...

**Очікувано:** ...
**Фактично:** ...

**Середовище:** Browser / OS / Build
**Фікс:** посилання на файл:рядок
```
