# Формат задач в `docs/prd.md`

`hk task lint` проверяет, `hk kickoff` превращает в GitHub Issues. Код читает **только** fenced-блоки
`hk-task` и `hk-epic`; остальной markdown PRD — для людей и игнорируется.
Этот файл — и спецификация, и фикстура тестов: пример ниже обязан проходить `hk task lint` без ошибок.

## Шапка одобрения

Первой строкой PRD — машиночитаемая шапка (в отрисованном markdown не видна):

```
<!-- hk:prd status: draft by: - at: - -->
```

`hk kickoff --apply` создаёт issues **только** при `status: approved`, иначе ошибка `plan_not_approved`.
Одобрил человек: `<!-- hk:prd status: approved by: <github-login> at: 2026-11-08T10:00:00Z -->`.
Product lead не ответил 20 минут — planner ставит `by: auto-timeout`. Dry-run (`hk kickoff`) работает без одобрения.

## Синтаксис блока

Строгое подмножество YAML, по ключу на строку:

- `ключ: значение` — строка (кавычки `"…"` / `'…'` необязательны);
- `ключ: [a, b]` — короткий список (элементы без запятых внутри);
- `ключ:` и ниже `  - пункт` — длинный список (так пишутся критерии приёмки);
- `skeleton: true`, `ready: false` — флаги, только `true` / `false`;
- пустые строки и строки, начинающиеся с `#`, пропускаются; CRLF допустим.

Неизвестный ключ, повторный ключ, непонятная строка — ошибка с номером строки.

## Поля задачи (`hk-task`)

| Поле | Обязательно | Что это |
|---|---|---|
| `id` | да | `T<номер>`, уникальный |
| `title` | да | заголовок issue |
| `area` | да | **одна** зона из `hk.config.json → areas` (одна задача — одна зона) |
| `tier` | да | `low` / `mid` / `high` — какой модели по силам |
| `goal` | да | одно предложение: зачем задача |
| `acceptance` | да | список критериев `Given … When … Then …` или `Дано … Когда … Тогда …` (регистр не важен, порядок слов важен) |
| `epic` | нет | `E<номер>` из блока `hk-epic` |
| `risk` | нет | `low` / `med` / `high`, по умолчанию `med` |
| `after` | нет | список `T<номер>`, от которых зависит задача |
| `paths` | нет | разрешённые пути (glob), только внутри своей зоны |
| `contract` | нет | ссылка на часть контракта, например `contracts/api.yaml#/paths/~1auth` |
| `out_of_scope` | нет | что НЕ делаем в этой задаче |
| `tests` | нет | список из `unit`, `contract`, `e2e` |
| `req` | нет | ID требований из `docs/tz-analysis.md`: `[R1, R3]` → раздел «Требования ТЗ» в issue |
| `tests_for` | нет | `T<номер>` — это задача на приёмочные тесты к указанной задаче: тесты пишутся в `tests/pending/<T>/`, основная задача ждёт её; `goal` и `acceptance` можно не писать (берутся у основной); зона — с `tests/pending/**` (обычно `e2e`) |
| `changes_acceptance` | нет | существующие приёмочные тесты, которые задача **переписывает** (обычно по фидбеку): `[tests/acceptance/test_3_login.py]` → раздел «Меняет приёмку»; только их PR задачи сможет менять (`hk-guard`) |
| `skeleton` | нет | `true` — сквозной каркас (ровно один, первым блоком) |
| `ready` | нет | `false` — спецификация не готова → `status:needs-spec` |

## Поля эпика (`hk-epic`)

`id` (`E<номер>`), `title`, `scenario` — обязательны; `demo` — как показать на демо.
Задачи входят в эпик полем `epic`. Эпики создаются после задач, в теле — список `- [ ] #N`.

## Команда (`hk-team`)

Один блок на PRD: кто за какие зоны отвечает. Строка — `логин-GitHub: зона1, зона2  # роль`.
Особая зона `review` — ревьюер команды (обычно капитан): `hk task next` отдаёт ему PR на ревью раньше задач.

- `hk kickoff --apply` назначает каждую задачу (assignee) на хозяина её зоны; `hk task next` даёт агенту сначала задачи, назначенные на его человека, потом ничьи, потом чужие (с пометкой, чья зона).
- Ошибки: у зоны с задачами нет хозяина; у зоны два хозяина; человек записан дважды; неизвестная зона; не логин.
- Предупреждения: нет блока; нет ревьюера; у человека нет задач; нагрузка неравная (у одного больше чем вдвое).
- Логины — участники репо (`gh api repos/{owner}/{repo}/collaborators --jq '.[].login'`); не участник — `--apply` откажет.

## Правила (ошибка — `hk task lint` не пропустит)

- Первый блок `hk-task` — каркас: `skeleton: true`, `tier: high`, `risk: high`, без `after`. Каркас один.
- У каждой `risk: high` задачи, кроме каркаса, есть ровно одна задача с `tests_for` на неё. `tests_for` не на каркас, не на себя, не на другую задачу на тесты; в `after` задачи на тесты её цели быть не может.
- `area` — одна строка и есть в `hk.config.json → areas`. `paths` вне зоны разрешены **только каркасу**.
- `risk: low` запрещён для зон `contracts` и `infra`.
- Критерии приёмки — только по форме Given/When/Then (или Дано/Когда/Тогда).
- `after` и `epic` ссылаются на существующие id, не на себя; циклов нет (`T2 → T4 → T2` — ошибка).
- `req` — только `R<номер>`.

Предупреждения: `risk: high` без `e2e` в `tests`; задач больше 25; одинаковые `title`; пустой эпик.

## Зависимости и статусы

- Каждая задача, кроме каркаса, **неявно зависит от каркаса** — `after: [T1]` писать не нужно; явный `after` добавляется к нему.
- Каркас → `status:ready`. С зависимостями → `status:waiting`, в теле «После #N, #M» и маркер `<!-- hk:after issues=N,M -->`.
- Когда все зависимости закрыты, `hk task promote` (job `promote` в `hk.yml` на закрытие issue, и `hk task sweep`) переводит задачу в `ready`.
- `ready: false` → `status:needs-spec`: агенты не берут, product lead доводит спецификацию.

## Уровни риска

| risk | Что значит |
|---|---|
| `low` | одно кросс-вендорное ревью, авто-мерж |
| `med` (по умолчанию) | ревью + тесты по критериям, авто-мерж |
| `high` | ревью + security-ревью, мержится первым вручную, E2E обязателен |

Требования на демо-пути (из `docs/tz-analysis.md`) — `risk: high` и идут первыми.

## Повторный запуск

В теле каждого issue — маркер `<!-- hk:task id=T2 hash=… prd=docs/prd.md -->`. Повторный `hk kickoff --apply`
пропускает задачи с маркером (идемпотентно) и создаёт только новые. Изменённый блок (`changed`) и задача,
которой больше нет в PRD (`orphan`), — только предупреждения: issues не меняются, правит человек.

## Полный пример

```hk-team
anna-dev: api, contracts, review   # капитан: бэкенд и ревью
boris: web                         # фронтенд
vera-qa: e2e, infra                # тесты и деплой
```

```hk-epic
id: E1
title: Регистрация и вход
scenario: Новый пользователь регистрируется по email и попадает на дашборд
demo: На демо регистрируем нового пользователя и сразу видим его дашборд
```

```hk-task
id: T1
title: Сквозной каркас web → api → деплой
area: infra
tier: high
risk: high
skeleton: true
paths: [web/**, api/**, infra/**, .github/**]
goal: Пустое приложение собирается, деплоится и отвечает на E2E hello-world
acceptance:
  - Given чистый репозиторий When запускаю генераторы из hk.config.json → scaffold Then hk check зелёный
  - Given задеплоенный стенд When открываю главную страницу Then вижу ответ api /health
tests: [e2e]
req: [R1]
```

```hk-task
id: T2
title: Контракт регистрации в contracts/api.yaml
epic: E1
area: contracts
tier: mid
risk: med
paths: [contracts/**]
goal: Фронт и бэк договорились о POST /auth/register до реализации
acceptance:
  - Дано пустой contracts/api.yaml Когда описываю POST /auth/register Тогда контракт проходит валидацию OpenAPI
  - Given контракт When генерирую клиента Then у клиента есть метод register(email, password)
tests: [contract, e2e]
req: [R2]
```

```hk-task
id: T3
title: API регистрации по email
epic: E1
area: api
tier: mid
after: [T2]
contract: contracts/api.yaml#/paths/~1auth~1register
paths: [api/src/auth/**]
goal: Бэк регистрирует пользователя по контракту
acceptance:
  - Given валидные email и пароль When POST /auth/register Then 201 и пользователь в БД
  - Given занятый email When POST /auth/register Then 409 с кодом email_taken
out_of_scope: [восстановление пароля, OAuth]
tests: [unit, contract]
req: [R2]
```

```hk-task
id: T4
title: Форма регистрации по email
epic: E1
area: web
tier: mid
risk: high
after: [T2, T3]
contract: contracts/api.yaml#/paths/~1auth~1register
paths: [web/src/features/auth/**]
goal: Пользователь регистрируется из формы и попадает на дашборд
acceptance:
  - Given открыта /register When ввожу валидные email и пароль Then вижу /dashboard
  - Дано email занят Когда отправляю форму Тогда вижу «email занят» и остаюсь на форме
out_of_scope: [восстановление пароля, OAuth]
tests: [unit, e2e]
req: [R2, R3]
```

```hk-task
id: T6
title: Приёмочные тесты формы регистрации
area: e2e
tier: mid
tests_for: T4
tests: [e2e]
```

```hk-task
id: T5
title: Тёмная тема
area: web
tier: low
risk: low
ready: false
goal: Интерфейс переключается в тёмную тему
acceptance:
  - Given открыта любая страница When нажимаю переключатель темы Then фон и текст меняются на тёмную палитру
tests: [unit]
```

Что получится (`hk kickoff`, dry-run): T1 → `status:ready`; T2, T3, T6, T4 → `status:waiting` (T2 — после T1,
T3 — после T1 и T2, T6 — после T1, T4 — после T1, T2, T3 и своих тестов T6); T5 → `status:needs-spec`;
эпик E1 — последним, со ссылками на T2–T4.

T6 — задача на тесты для `risk: high` задачи T4: другой агент пишет тесты по критериям T4 в `tests/pending/T4/`,
а исполнитель T4 первым коммитом переносит их в `tests/acceptance/` без изменений.
