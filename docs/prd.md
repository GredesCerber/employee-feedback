<!-- hk:prd status: draft by: - at: - -->
# PRD: <название продукта>

> Пишет planner по `docs/tz.md` и `docs/tz-analysis.md` (навык `hk-kickoff`), не больше страницы текста + блоки задач.
> Формат блоков — `agents/skills/hk-kickoff/task-format.md`. Проверка: `hk task lint`. План: `hk kickoff`.
> Шапка в первой строке — одобрение. `hk kickoff --apply` создаёт issues только при
> `<!-- hk:prd status: approved by: <github-login> at: <ISO-время> -->`
> (нет ответа product lead 20 минут — planner ставит `by: auto-timeout`).

## Проблема и для кого

<1–2 предложения>

## Демо-путь

Шаги, которые жюри увидит на демо. Требования на этом пути — must, `risk: high`, делаются первыми.

1. <шаг> — R1
2. <шаг> — R2
3. <шаг> — R3

## Сценарии

- <основной сценарий 1>

## НЕ делаем

- <что сознательно вырезали>

## Критерии жюри → как закрываем

| Критерий | Чем закрываем |
|---|---|
| <из docs/tz.md> | <задача / эпик> |

## Стек

Из `hk.config.json → stack`; генераторы каркаса — `hk.config.json → scaffold`.

## Эпики и задачи

Первый блок `hk-task` — всегда сквозной каркас. Остальные задачи неявно ждут его (`after` писать не нужно).

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
